import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

async function makeUser() {
  const userId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1,$2)", [userId, `${userId}@e.test`]);
  return userId;
}

async function makeEvent(ownerId: string, options: { status?: string; endDate?: string } = {}) {
  const eventId = randomUUID();
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,'会',$3,$4,$4)",
    [eventId, ownerId, options.status ?? "confirmed", options.endDate ?? "2099-01-01"]
  );
  return eventId;
}

async function joinEvent(eventId: string, userId: string, status = "joined") {
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'メンバー','member',$3)",
    [eventId, userId, status]
  );
}

/** me と others 全員が参加しているイベントを1つ作る。 */
async function shareEvent(me: string, ...others: string[]) {
  const eventId = await makeEvent(me);
  await joinEvent(eventId, me);
  for (const other of others) await joinEvent(eventId, other);
  return eventId;
}

async function asUser(userId: string) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function createGroup(name: string, color = "nazotoki", memberIds: string[] = []) {
  const { rows } = await client.query("select public.create_connection_group($1, $2, $3::uuid[]) as id", [
    name,
    color,
    memberIds
  ]);
  return rows[0].id as string;
}

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("begin");
});
afterEach(async () => {
  await client.query("rollback");
});

async function inviteesOf(eventId: string) {
  const { rows } = await client.query(
    "select group_name, group_member_count, user_id from public.list_event_group_invitees($1)",
    [eventId]
  );
  return rows;
}

describe("list_event_group_invitees", () => {
  it("グループごとに、そのイベントに招待できるメンバーを返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const mio = await makeUser();
    await shareEvent(me, aya, ken, mio);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await joinEvent(target, ken); // 参加済み
    await asUser(me);
    await createGroup("謎解き仲間", "nazotoki", [aya, ken]);
    await createGroup("大学の友達", "boardgame", [mio]);
    await client.query(
      "insert into public.event_user_invitations (event_id, inviter_user_id, invitee_user_id, status) values ($1,$2,$3,'pending')",
      [target, me, mio]
    ); // 招待済み

    expect(await inviteesOf(target)).toEqual([
      { group_name: "謎解き仲間", group_member_count: "2", user_id: aya },
      { group_name: "大学の友達", group_member_count: "1", user_id: null }
    ]);
  });

  it("メンバーが0人のグループは返さない。ブロック関係・退会した人は数えない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const blocked = await makeUser();
    await shareEvent(me, aya, blocked);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);
    await createGroup("空", "honey");
    await createGroup("仲間", "nazotoki", [aya, blocked]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);

    expect(await inviteesOf(target)).toEqual([{ group_name: "仲間", group_member_count: "1", user_id: aya }]);
  });

  it("主催者でなければ呼べない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const target = await makeEvent(other);
    await joinEvent(target, other);
    await asUser(me);
    await client.query("savepoint not_owner");
    await expect(inviteesOf(target)).rejects.toThrow(/Event owner required/);
    await client.query("rollback to savepoint not_owner");
  });
});

describe("create_event_user_invitations", () => {
  it("招待を送れ、同じ人にもう一度送ると already_invited になる（変数と列の名前の衝突 42702 の回帰）", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    const first = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [target, [aya]]);
    expect(first.rows[0].result).toMatchObject({ ok: true, created_count: 1 });

    const second = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [target, [aya]]);
    expect(second.rows[0].result).toMatchObject({ ok: false, error: "already_invited" });
  });
});

describe("create_event_user_invitations の上限", () => {
  it("30人までまとめて送れて、31人は invalid_input", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    const over = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      people
    ]);
    expect(over.rows[0].result).toMatchObject({ ok: false, error: "invalid_input" });

    const ok = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      people.slice(0, 30)
    ]);
    expect(ok.rows[0].result).toMatchObject({ ok: true });
  });
});
