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

const NOW = new Date();
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}
const iso = (d: Date) => d.toISOString();

let ownerId: string;

async function makeEvent(status: string): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `insert into public.events (id, owner_user_id, title, category, status)
     values ($1, $2, 'sort', 'other', $3)`,
    [eventId, ownerId, status]
  );
  await client.query(
    `insert into public.event_members (event_id, user_id, display_name, role, status)
     values ($1, $2, 'me', 'member', 'joined')`,
    [eventId, ownerId]
  );
  return eventId;
}

async function addPlan(
  eventId: string,
  seed: { status: string; settlementStatus?: string; confirmedStart?: Date; confirmedEnd?: Date }
): Promise<void> {
  await client.query(
    `insert into public.plans
       (event_id, owner_user_id, title, status, settlement_status, confirmed_start_at, confirmed_end_at)
     values ($1, $2, 'p', $3, $4, $5, $6)`,
    [
      eventId,
      ownerId,
      seed.status,
      seed.settlementStatus ?? "not_started",
      seed.confirmedStart ? iso(seed.confirmedStart) : null,
      seed.confirmedEnd ? iso(seed.confirmedEnd) : null
    ]
  );
}

async function rpcIds(sort: string): Promise<string[]> {
  const { rows } = await client.query<{ event_ids: string[] }>(
    `select event_ids from public.list_owned_event_ids('active', 'all', $1, 50, 0, null, 'all')`,
    [sort]
  );
  return rows[0]?.event_ids ?? [];
}

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await client.query("begin");
  ownerId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1, $2)", [ownerId, `${ownerId}@e.test`]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
});
afterEach(async () => {
  await client.query("rollback");
});

describe("list_owned_event_ids の soonest 並び順", () => {
  it("未来の予定 → 過去の未清算（直近ほど上）→ 日付なし、の順に並ぶ", async () => {
    // A: 7日後に確定
    const a = await makeEvent("confirmed");
    await addPlan(a, { status: "date_confirmed", confirmedStart: daysFromNow(7), confirmedEnd: daysFromNow(7) });

    // B: 2日後に確定（A より近いので前に来る）
    const b = await makeEvent("confirmed");
    await addPlan(b, { status: "date_confirmed", confirmedStart: daysFromNow(2), confirmedEnd: daysFromNow(2) });

    // C: 3日前に終わった確定＋清算中（settlement_waiting なので active に残る）
    const c = await makeEvent("confirmed");
    await addPlan(c, {
      status: "date_confirmed",
      settlementStatus: "settling",
      confirmedStart: daysFromNow(-3),
      confirmedEnd: daysFromNow(-3)
    });

    // D: 30日前に終わった確定＋清算中（C より昔なので過去バケツの中で下）
    const d = await makeEvent("confirmed");
    await addPlan(d, {
      status: "date_confirmed",
      settlementStatus: "settling",
      confirmedStart: daysFromNow(-30),
      confirmedEnd: daysFromNow(-30)
    });

    // E: 日付なし（日程作成待ち）
    const e = await makeEvent("planning");

    expect(await rpcIds("soonest")).toEqual([b, a, c, d, e]);
  });

  it("newest は作成順（新しいものが先）のまま", async () => {
    const first = await makeEvent("planning");
    const second = await makeEvent("planning");
    await client.query("update public.events set created_at = now() - interval '1 hour' where id = $1", [first]);

    expect(await rpcIds("newest")).toEqual([second, first]);
  });
});
