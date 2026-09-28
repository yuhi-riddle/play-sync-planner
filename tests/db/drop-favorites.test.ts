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

async function columnsOf(sql: string, params: unknown[] = []) {
  const { fields } = await client.query(sql, params);
  return fields.map((field) => field.name);
}

describe("お気に入りの削除", () => {
  it("user_favorites・toggle_favorite_atomic・移行関数がない", async () => {
    const { rows } = await client.query(
      "select to_regclass('public.user_favorites') as tbl, to_regprocedure('public.toggle_favorite_atomic(uuid)') as toggle, to_regprocedure('private.migrate_favorites_to_connection_groups()') as migrate"
    );
    expect(rows[0]).toEqual({ tbl: null, toggle: null, migrate: null });
  });

  it("list_connections と list_event_invite_candidates の戻り値に is_favorite がない", async () => {
    const me = await makeUser();
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    expect(await columnsOf("select * from public.list_connections('following', null, null, 20)")).not.toContain("is_favorite");
    expect(
      await columnsOf("select * from public.list_event_invite_candidates($1, null, null, null, 20)", [target])
    ).not.toContain("is_favorite");
  });

  it("つながり・件数・招待候補・招待はフォローと一緒に参加だけで今までどおり動く", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    const followedOnly = await makeUser();
    await shareEvent(me, aya);
    await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2),($1,$3)", [
      me,
      aya,
      followedOnly
    ]);
    const target = await makeEvent(me);
    await joinEvent(target, me);
    await asUser(me);

    const following = await client.query("select user_id from public.list_connections('following', null, null, 20)");
    expect(following.rows.map((row) => row.user_id)).toEqual([aya]);
    const counts = await client.query("select category, item_count from public.get_connection_counts()");
    const byCategory = Object.fromEntries(counts.rows.map((row) => [row.category, Number(row.item_count)]));
    expect(byCategory.following).toBe(1);
    expect(byCategory).not.toHaveProperty("favorites");

    const candidates = await client.query(
      "select user_id from public.list_event_invite_candidates($1, null, null, null, 20)",
      [target]
    );
    expect(candidates.rows.map((row) => row.user_id).sort()).toEqual([aya, followedOnly].sort());

    const invited = await client.query("select public.create_event_user_invitations($1, $2::uuid[]) as result", [
      target,
      [followedOnly]
    ]);
    expect(invited.rows[0].result).toMatchObject({ ok: true, created_count: 1 });
  });

  it("ブロックと退会は今までどおり動く", async () => {
    const me = await makeUser();
    const aya = await makeUser();
    await shareEvent(me, aya);
    await asUser(me);
    await client.query("select public.block_user_atomic($1)", [aya]);
    const { rows } = await client.query(
      "select count(*)::int as n from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2",
      [me, aya]
    );
    expect(rows[0].n).toBe(1);

    await client.query("select public.finalize_account_withdrawal($1)", [aya]);
  });
});
