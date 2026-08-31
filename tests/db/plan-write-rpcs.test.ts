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

async function makeEvent() {
  const ownerId = randomUUID();
  const eventId = randomUUID();
  await client.query("insert into auth.users (id, email) values ($1,$2)", [ownerId, `${ownerId}@e.test`]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
  await client.query("insert into public.events (id, owner_user_id, title) values ($1,$2,'plan rpc')", [eventId, ownerId]);
  await client.query(
    "insert into public.event_members (event_id, user_id, display_name, role, status) values ($1,$2,'主催',$3,'joined')",
    [eventId, ownerId, "organizer"]
  );
  return { ownerId, eventId };
}

const CANDIDATES = JSON.stringify([
  { start_at: "2026-07-15T01:00:00.000Z", end_at: "2026-07-15T03:00:00.000Z", is_all_day: false, sort_order: 0 },
  { start_at: "2026-07-16T01:00:00.000Z", end_at: null, is_all_day: true, sort_order: 1 }
]);

async function createPlan(eventId: string, ownerId: string) {
  const participants = JSON.stringify([
    { user_id: ownerId, display_name: "主催", participant_type: "registered", status: "invited", is_organizer: true }
  ]);
  const { rows } = await client.query<{ id: string }>(
    `select public.create_plan_with_children(
       $1,'夏の予定',$2::timestamptz,null,$3::jsonb,$4::jsonb,$5,$6::timestamptz,$7,$8::integer[]
     ) as id`,
    [eventId, "2026-07-10T14:00:00.000Z", participants, CANDIDATES, randomUUID(), null, 1440, "{1440,60}"]
  );
  return rows[0].id;
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

describe("create_plan_with_children", () => {
  it("plan・参加者・候補日・共有リンク・リマインド設定を 1 回で作る", async () => {
    const { ownerId, eventId } = await makeEvent();
    const planId = await createPlan(eventId, ownerId);

    const plan = await client.query<{ owner_user_id: string; status: string }>(
      "select owner_user_id, status from public.plans where id = $1",
      [planId]
    );
    expect(plan.rows[0]).toMatchObject({ owner_user_id: ownerId, status: "collecting_answers" });

    expect((await client.query("select 1 from public.participants where plan_id = $1", [planId])).rows).toHaveLength(1);
    expect((await client.query("select 1 from public.candidate_dates where plan_id = $1", [planId])).rows).toHaveLength(2);
    expect((await client.query("select 1 from public.share_links where plan_id = $1 and purpose = 'answer'", [planId])).rows).toHaveLength(1);

    const reminder = await client.query<{ reminder_offsets_minutes: number[] }>(
      "select reminder_offsets_minutes from public.plan_reminder_settings where plan_id = $1",
      [planId]
    );
    expect(reminder.rows[0].reminder_offsets_minutes).toEqual([1440, 60]);
  });

  it("主催者でない auth.uid は raise し、plan は残らない", async () => {
    const { eventId } = await makeEvent();
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);

    await client.query("savepoint sp");
    await expect(
      client.query(
        "select public.create_plan_with_children($1,'x',now(),null,'[]'::jsonb,'[]'::jsonb,$2,null,null,'{}'::integer[])",
        [eventId, randomUUID()]
      )
    ).rejects.toThrow(/主催者だけ/);
    await client.query("rollback to savepoint sp");

    expect((await client.query("select 1 from public.plans where event_id = $1", [eventId])).rows).toHaveLength(0);
  });

  it("候補日が不正（end < start）なら全部ロールバックされる", async () => {
    const { ownerId, eventId } = await makeEvent();
    const bad = JSON.stringify([{ start_at: "2026-07-15T03:00:00.000Z", end_at: "2026-07-15T01:00:00.000Z", sort_order: 0 }]);
    const participants = JSON.stringify([
      { user_id: ownerId, display_name: "主催", participant_type: "registered", status: "invited", is_organizer: true }
    ]);

    await client.query("savepoint sp");
    await expect(
      client.query(
        `select public.create_plan_with_children($1,'x',now(),null,$2::jsonb,$3::jsonb,$4,null,null,'{}'::integer[])`,
        [eventId, participants, bad, randomUUID()]
      )
    ).rejects.toThrow(/candidate_dates_range_check/);
    await client.query("rollback to savepoint sp");

    expect((await client.query("select 1 from public.plans where event_id = $1", [eventId])).rows).toHaveLength(0);
    expect((await client.query("select 1 from public.participants p join public.plans pl on pl.id = p.plan_id where pl.event_id = $1", [eventId])).rows).toHaveLength(0);
  });
});

describe("replace_plan_schedule", () => {
  it("候補日と回答を入れ替え、リマインド設定を upsert し、event_id を返す", async () => {
    const { ownerId, eventId } = await makeEvent();
    const planId = await createPlan(eventId, ownerId);

    // 既存候補日に回答を1件付ける
    const participant = await client.query<{ id: string }>(
      "select id from public.participants where plan_id = $1 limit 1",
      [planId]
    );
    const candidate = await client.query<{ id: string }>(
      "select id from public.candidate_dates where plan_id = $1 order by sort_order limit 1",
      [planId]
    );
    await client.query(
      "insert into public.availability_answers (candidate_date_id, participant_id, answer) values ($1,$2,'yes')",
      [candidate.rows[0].id, participant.rows[0].id]
    );

    const newDates = JSON.stringify([
      { start_at: "2026-08-01T01:00:00.000Z", end_at: null, is_all_day: false, sort_order: 0 }
    ]);
    const { rows } = await client.query<{ event_id: string }>(
      `select public.replace_plan_schedule($1,'更新後',$2::timestamptz,'メモ',$3::jsonb,120,'{120}'::integer[]) as event_id`,
      [planId, "2026-07-20T14:00:00.000Z", newDates]
    );
    expect(rows[0].event_id).toBe(eventId);

    const dates = await client.query<{ start_at: string }>(
      "select start_at from public.candidate_dates where plan_id = $1",
      [planId]
    );
    expect(dates.rows).toHaveLength(1);
    // 旧候補日が消えたので、そこに紐づいていた回答も消えている
    expect(
      (await client.query("select 1 from public.availability_answers a join public.candidate_dates c on c.id = a.candidate_date_id where c.plan_id = $1", [planId])).rows
    ).toHaveLength(0);

    const plan = await client.query<{ title: string; memo: string }>(
      "select title, memo from public.plans where id = $1",
      [planId]
    );
    expect(plan.rows[0]).toMatchObject({ title: "更新後", memo: "メモ" });

    const reminder = await client.query<{ reminder_offsets_minutes: number[] }>(
      "select reminder_offsets_minutes from public.plan_reminder_settings where plan_id = $1",
      [planId]
    );
    expect(reminder.rows[0].reminder_offsets_minutes).toEqual([120]);
  });

  it("主催者でない auth.uid は raise する", async () => {
    const { ownerId, eventId } = await makeEvent();
    const planId = await createPlan(eventId, ownerId);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);

    await client.query("savepoint sp");
    await expect(
      client.query(
        "select public.replace_plan_schedule($1,'x',now(),null,'[]'::jsonb,null,'{}'::integer[])",
        [planId]
      )
    ).rejects.toThrow(/主催者だけ/);
    await client.query("rollback to savepoint sp");
  });
});
