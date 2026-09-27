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

async function makeEvent(
  ownerId: string,
  options: { status?: string; startDate?: string; endDate?: string; title?: string } = {}
) {
  const eventId = randomUUID();
  const startDate = options.startDate ?? "2099-01-01";
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,$3,$4,$5,$6)",
    [eventId, ownerId, options.title ?? "会", options.status ?? "confirmed", startDate, options.endDate ?? startDate]
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

async function eventsOf(groupId: string) {
  const { rows } = await client.query(
    "select title, display_state, is_active, member_count, group_member_count from public.list_connection_group_events($1)",
    [groupId]
  );
  return rows;
}

describe("list_connection_group_events", () => {
  it("メンバーが1人でも参加しているイベントを、重なりの人数つきで返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const outsider = await makeUser();
    const both = await makeEvent(me, { title: "2人とも", startDate: "2099-02-01" });
    for (const user of [me, aya, ken]) await joinEvent(both, user);
    const onlyAya = await makeEvent(me, { title: "あやだけ", startDate: "2099-01-01" });
    for (const user of [me, aya]) await joinEvent(onlyAya, user);
    const noMember = await makeEvent(me, { title: "メンバーなし" });
    for (const user of [me, outsider]) await joinEvent(noMember, user);
    const withoutMe = await makeEvent(aya, { title: "自分は不参加" });
    await joinEvent(withoutMe, aya);
    await asUser(me);
    const groupId = await createGroup("謎解き仲間", "nazotoki", [aya, ken]);

    expect(await eventsOf(groupId)).toEqual([
      { title: "あやだけ", display_state: expect.any(String), is_active: true, member_count: "1", group_member_count: "2" },
      { title: "2人とも", display_state: expect.any(String), is_active: true, member_count: "2", group_member_count: "2" }
    ]);
  });

  it("おわったイベントは進行中のあとに、新しい順で5件まで返す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const active = await makeEvent(me, { title: "進行中" });
    for (const user of [me, aya]) await joinEvent(active, user);
    for (let i = 1; i <= 6; i += 1) {
      const day = String(i).padStart(2, "0");
      const done = await makeEvent(me, { title: `おわり${i}`, status: "done", startDate: `2020-01-${day}` });
      for (const user of [me, aya]) await joinEvent(done, user);
    }
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya]);

    const rows = await eventsOf(groupId);
    expect(rows.map((row) => row.title)).toEqual(["進行中", "おわり6", "おわり5", "おわり4", "おわり3", "おわり2"]);
    expect(rows.map((row) => row.is_active)).toEqual([true, false, false, false, false, false]);
  });

  it("ブロック関係の人・退会した人は重なりにもグループの人数にも数えない", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const blocked = await makeUser();
    const withdrawn = await makeUser();
    const eventId = await makeEvent(me);
    for (const user of [me, aya, blocked, withdrawn]) await joinEvent(eventId, user);
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya, blocked, withdrawn]);
    await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)", [blocked, me]);
    await client.query("update public.profiles set deleted_at = now(), deletion_state = 'pending' where user_id = $1", [
      withdrawn
    ]);

    expect(await eventsOf(groupId)).toEqual([
      { title: "会", display_state: expect.any(String), is_active: true, member_count: "1", group_member_count: "1" }
    ]);
  });

  it("他人のグループは空で返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    const groupId = await createGroup("仲間", "nazotoki", [aya]);

    await asUser(other);
    expect(await eventsOf(groupId)).toEqual([]);
  });
});
