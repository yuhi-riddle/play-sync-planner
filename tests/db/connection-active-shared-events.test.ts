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
  title: string,
  options: { status?: string; endDate?: string } = {}
) {
  const eventId = randomUUID();
  await client.query(
    "insert into public.events (id, owner_user_id, title, status, start_date, end_date) values ($1,$2,$3,$4,$5,$5)",
    [eventId, ownerId, title, options.status ?? "confirmed", options.endDate ?? "2099-01-01"]
  );
  return eventId;
}

async function joinEvent(eventId: string, userId: string, status = "joined") {
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'メンバー','member',$3)",
    [eventId, userId, status]
  );
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

describe("list_active_shared_events", () => {
  it("自分と相手が両方joinedな進行中イベントだけ返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "進行中の会", { status: "confirmed", endDate: "2099-01-01" });
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);

    await asUser(me);
    const { rows } = await client.query(
      "select event_id, title, display_state from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_id: eventId, title: "進行中の会" });
  });

  it("相手が抜けたイベントは含めない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "抜けた会");
    await joinEvent(eventId, me);
    await joinEvent(eventId, other, "removed");

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });

  it("開催済み・清算不要のイベントは含めない", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "終わった会", { status: "done", endDate: "2020-01-01" });
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });

  it("ブロック関係があれば空を返す", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const eventId = await makeEvent(me, "ブロック済みとの会");
    await joinEvent(eventId, me);
    await joinEvent(eventId, other);
    await client.query(
      "insert into public.user_blocks (blocker_user_id, blocked_user_id) values ($1,$2)",
      [me, other]
    );

    await asUser(me);
    const { rows } = await client.query(
      "select event_id from public.list_active_shared_events($1)",
      [other]
    );

    expect(rows).toHaveLength(0);
  });
});

describe("list_connections の active_shared_event_count", () => {
  it("進行中の共通イベントだけを数える（開催済みは含めない）", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const activeEventId = await makeEvent(me, "進行中の会", { status: "confirmed", endDate: "2099-01-01" });
    const doneEventId = await makeEvent(me, "終わった会", { status: "done", endDate: "2020-01-01" });
    await joinEvent(activeEventId, me);
    await joinEvent(activeEventId, other);
    await joinEvent(doneEventId, me);
    await joinEvent(doneEventId, other);

    await asUser(me);
    await client.query(
      "insert into public.user_connections (follower_user_id, followed_user_id) values ($1,$2)",
      [me, other]
    );
    const { rows } = await client.query(
      "select shared_event_count, active_shared_event_count from public.list_connections('following', null, null, 20)"
    );

    const row = rows.find((candidate: { user_id?: string }) => true);
    expect(row).toMatchObject({ shared_event_count: "2", active_shared_event_count: "1" });
  });
});
