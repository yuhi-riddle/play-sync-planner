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

describe("private.migrate_favorites_to_connection_groups", () => {
  it("お気に入りがいる人ごとに「お気に入り」グループを作り、相手を入れる。何度呼んでも同じ", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const ken = await makeUser();
    const nobody = await makeUser();
    await shareEvent(me, aya, ken);
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2),($1,$3)", [me, aya, ken]);

    await client.query("select private.migrate_favorites_to_connection_groups()");
    await client.query("select private.migrate_favorites_to_connection_groups()");

    const groups = await client.query(
      "select owner_user_id, name, color from public.connection_groups where owner_user_id = any($1::uuid[])",
      [[me, nobody]]
    );
    expect(groups.rows).toEqual([{ owner_user_id: me, name: "お気に入り", color: "nazotoki" }]);

    await asUser(me);
    const members = await client.query("select member_user_id from public.list_connection_group_memberships()");
    expect(members.rows.map((row) => row.member_user_id).sort()).toEqual([aya, ken].sort());
  });

  it("すでに「お気に入り」という名前のグループがあれば、そこへ足す", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await client.query("select public.create_connection_group('お気に入り', 'honey', '{}'::uuid[])");
    await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, aya]);

    await client.query("select private.migrate_favorites_to_connection_groups()");

    const { rows } = await client.query("select name, color, member_count from public.list_connection_groups()");
    expect(rows).toEqual([{ name: "お気に入り", color: "honey", member_count: "1" }]);
  });

  it("31人以上のお気に入りもすべて移す", async () => {
    const me = await makeUser();
    const people: string[] = [];
    for (let i = 0; i < 31; i += 1) people.push(await makeUser());
    await shareEvent(me, ...people);
    for (const person of people) {
      await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [me, person]);
    }

    await client.query("select private.migrate_favorites_to_connection_groups()");

    await asUser(me);
    const { rows } = await client.query("select member_count from public.list_connection_groups()");
    expect(rows[0].member_count).toBe("31");
  });
});
