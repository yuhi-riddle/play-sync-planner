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

const WITHDRAWN = "退会したユーザー";

type Fixture = { userId: string; peerId: string; eventId: string };

async function seed(): Promise<Fixture> {
  const userId = randomUUID();
  const peerId = randomUUID();
  const eventId = randomUUID();

  await client.query("insert into auth.users (id, email) values ($1,$2),($3,$4)", [
    userId,
    `${userId}@e.test`,
    peerId,
    `${peerId}@e.test`
  ]);
  // auth.users への insert が profiles 作成トリガーを発火させる環境があるので upsert する。
  await client.query(
    `insert into public.profiles (user_id, nickname, avatar_path) values ($1,'あかり',$2),($3,'ぴあ',null)
     on conflict (user_id) do update set nickname = excluded.nickname, avatar_path = excluded.avatar_path`,
    [userId, `${userId}/avatar.png`, peerId]
  );

  await client.query("insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2),($2,$1)", [userId, peerId]);
  await client.query("insert into public.user_favorites (user_id, favorite_user_id) values ($1,$2)", [userId, peerId]);
  await client.query("insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($2,$1)", [userId, peerId]);
  await client.query(
    "insert into public.notifications (user_id, kind, title, body, href, dedupe_key) values ($1,'unanswered','t','b','/x',$2)",
    [userId, randomUUID()]
  );
  await client.query("insert into public.event_drafts (owner_user_id) values ($1)", [userId]);
  await client.query(
    "insert into public.calendar_integrations (user_id, encrypted_refresh_token) values ($1,'enc')",
    [userId]
  );

  // 退会者が主催するイベントとメンバー行（イベントは残る／メンバーの表示名は匿名化される）
  await client.query("insert into public.events (id, owner_user_id, title) values ($1,$2,'のこすイベント')", [eventId, userId]);
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'あかり','organizer','joined')",
    [eventId, userId]
  );
  await client.query(
    "insert into public.event_user_invitations (event_id, inviter_user_id, invitee_user_id) values ($1,$2,$3)",
    [eventId, userId, peerId]
  );

  return { userId, peerId, eventId };
}

async function count(sql: string, params: unknown[]) {
  const { rows } = await client.query<{ n: string }>(`select count(*)::text as n from ${sql}`, params);
  return Number(rows[0].n);
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

describe("finalize_account_withdrawal", () => {
  it("本人だけのデータを消し、表示名を匿名化し、deletion_state を done にする", async () => {
    const f = await seed();

    await client.query("select public.finalize_account_withdrawal($1)", [f.userId]);

    expect(await count("public.user_connections where follower_user_id = $1 or followed_user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.user_favorites where user_id = $1 or favorite_user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.user_blocks where blocker_user_id = $1 or blocked_user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.notifications where user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.event_drafts where owner_user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.calendar_integrations where user_id = $1", [f.userId])).toBe(0);
    expect(await count("public.event_user_invitations where inviter_user_id = $1 or invitee_user_id = $1", [f.userId])).toBe(0);

    const member = await client.query<{ display_name: string }>(
      "select display_name from public.event_members where event_id = $1 and user_id = $2",
      [f.eventId, f.userId]
    );
    expect(member.rows[0].display_name).toBe(WITHDRAWN);

    const profile = await client.query<{ nickname: string; avatar_path: string | null; deleted_at: string | null; deletion_state: string }>(
      "select nickname, avatar_path, deleted_at, deletion_state from public.profiles where user_id = $1",
      [f.userId]
    );
    expect(profile.rows[0]).toMatchObject({
      nickname: WITHDRAWN,
      avatar_path: null,
      deletion_state: "done"
    });
    expect(profile.rows[0].deleted_at).not.toBeNull();
  });

  it("主催イベントは残す", async () => {
    const f = await seed();
    await client.query("select public.finalize_account_withdrawal($1)", [f.userId]);
    expect(await count("public.events where id = $1", [f.eventId])).toBe(1);
  });

  it("2 回呼んでもエラーにならず結果は同じ（再実行可能）", async () => {
    const f = await seed();
    await client.query("select public.finalize_account_withdrawal($1)", [f.userId]);
    const firstDeletedAt = (
      await client.query<{ deleted_at: string }>(
        "select deleted_at::text as deleted_at from public.profiles where user_id = $1",
        [f.userId]
      )
    ).rows[0].deleted_at;

    await client.query("select public.finalize_account_withdrawal($1)", [f.userId]);

    const profile = await client.query<{ deleted_at: string; deletion_state: string }>(
      "select deleted_at::text as deleted_at, deletion_state from public.profiles where user_id = $1",
      [f.userId]
    );
    // deleted_at は coalesce で保持されるので初回の値のまま
    expect(profile.rows[0].deleted_at).toBe(firstDeletedAt);
    expect(profile.rows[0].deletion_state).toBe("done");
  });
});
