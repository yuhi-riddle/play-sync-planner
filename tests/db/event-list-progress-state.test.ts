import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getEventDisplayState, type EventListItem } from "@/lib/domain/event/event-filter";

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
const dateOnly = (d: Date) => iso(d).slice(0, 10);

let ownerId: string;

/** owner の events を1件作り、joined メンバーも入れる。返り値は event id。 */
async function makeEvent(status: string, opts: { startDate?: Date; endDate?: Date } = {}): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `insert into public.events (id, owner_user_id, title, category, status, start_date, end_date)
     values ($1, $2, 'parity', 'other', $3, $4, $5)`,
    [
      eventId,
      ownerId,
      status,
      opts.startDate ? dateOnly(opts.startDate) : null,
      opts.endDate ? dateOnly(opts.endDate) : null
    ]
  );
  await client.query(
    `insert into public.event_members (event_id, user_id, display_name, role, status)
     values ($1, $2, 'me', 'member', 'joined')`,
    [eventId, ownerId]
  );
  return eventId;
}

type PlanSeed = {
  status: string;
  settlementStatus?: string;
  confirmedStart?: Date | null;
  confirmedEnd?: Date | null;
  isAllDay?: boolean;
};

async function addPlan(eventId: string, seed: PlanSeed): Promise<void> {
  await client.query(
    `insert into public.plans
       (event_id, owner_user_id, title, status, settlement_status, confirmed_start_at, confirmed_end_at, is_all_day)
     values ($1, $2, 'p', $3, $4, $5, $6, $7)`,
    [
      eventId,
      ownerId,
      seed.status,
      seed.settlementStatus ?? "not_started",
      seed.confirmedStart ? iso(seed.confirmedStart) : null,
      seed.confirmedEnd ? iso(seed.confirmedEnd) : null,
      seed.isAllDay ?? false
    ]
  );
}

/** DB に入れたのと同じ内容から EventListItem を組み立てる（TS 判定に食わせる用）。 */
function toItem(status: string, plans: PlanSeed[], startDate?: Date, endDate?: Date): EventListItem {
  return {
    status,
    created_at: iso(NOW),
    start_date: startDate ? dateOnly(startDate) : null,
    end_date: endDate ? dateOnly(endDate) : null,
    plans: plans.map((p) => ({
      status: p.status,
      settlement_status: p.settlementStatus ?? "not_started",
      confirmed_start_at: p.confirmedStart ? iso(p.confirmedStart) : null,
      confirmed_end_at: p.confirmedEnd ? iso(p.confirmedEnd) : null,
      is_all_day: p.isAllDay ?? false
    })),
    event_members: [{ status: "joined" }]
  };
}

async function rpcIds(displayState: string): Promise<string[]> {
  const { rows } = await client.query<{ event_ids: string[] }>(
    `select event_ids from public.list_owned_event_ids('active', 'all', 'newest', 50, 0, null, $1)`,
    [displayState]
  );
  return rows[0]?.event_ids ?? [];
}

/** RPC が p_display_state で絞れるのは「進行中」の内訳5つだけ（completed/cancelled は p_filter 側）。 */
const PROGRESS_STATES = [
  "participant_waiting",
  "schedule_creation_waiting",
  "answer_waiting",
  "event_waiting",
  "settlement_waiting"
] as const;

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

describe("list_owned_event_ids の display_state 絞り込みは getEventDisplayState と一致する", () => {
  it("進行中の内訳5状態それぞれで RPC の結果と TS の分類が一致する", async () => {
    const specs: { id: string; item: EventListItem }[] = [];

    // participant_waiting: status='interested'、plan なし
    {
      const id = await makeEvent("interested");
      specs.push({ id, item: toItem("interested", []) });
    }
    // schedule_creation_waiting: status='planning'、plan なし、開催日未設定
    {
      const id = await makeEvent("planning");
      specs.push({ id, item: toItem("planning", []) });
    }
    // answer_waiting: collecting_answers の plan あり
    {
      const id = await makeEvent("planning");
      await addPlan(id, { status: "collecting_answers" });
      specs.push({ id, item: toItem("planning", [{ status: "collecting_answers" }]) });
    }
    // event_waiting: 3日後に確定予定
    {
      const start = daysFromNow(3);
      const end = daysFromNow(3);
      const id = await makeEvent("confirmed");
      await addPlan(id, { status: "date_confirmed", confirmedStart: start, confirmedEnd: end });
      specs.push({
        id,
        item: toItem("confirmed", [{ status: "date_confirmed", confirmedStart: start, confirmedEnd: end }])
      });
    }
    // settlement_waiting: 3日前に終わった確定予定＋清算 settling
    {
      const start = daysFromNow(-3);
      const end = daysFromNow(-3);
      const id = await makeEvent("confirmed");
      await addPlan(id, {
        status: "date_confirmed",
        settlementStatus: "settling",
        confirmedStart: start,
        confirmedEnd: end
      });
      specs.push({
        id,
        item: toItem("confirmed", [
          { status: "date_confirmed", settlementStatus: "settling", confirmedStart: start, confirmedEnd: end }
        ])
      });
    }
    // 負のコントロール: completed（3日前終了＋清算不要）は進行状態フィルタのどれにも出ない
    {
      const start = daysFromNow(-3);
      const end = daysFromNow(-3);
      const id = await makeEvent("done");
      await addPlan(id, {
        status: "date_confirmed",
        settlementStatus: "not_needed",
        confirmedStart: start,
        confirmedEnd: end
      });
      specs.push({
        id,
        item: toItem("done", [
          { status: "date_confirmed", settlementStatus: "not_needed", confirmedStart: start, confirmedEnd: end }
        ])
      });
    }
    // 負のコントロール: cancelled
    {
      const id = await makeEvent("cancelled");
      specs.push({ id, item: toItem("cancelled", []) });
    }

    const tsState = new Map(specs.map((s) => [s.id, getEventDisplayState(s.item, NOW)]));

    for (const state of PROGRESS_STATES) {
      const fromRpc = new Set(await rpcIds(state));
      const fromTs = new Set(specs.filter((s) => tsState.get(s.id) === state).map((s) => s.id));
      expect([...fromRpc].sort(), `state=${state}`).toEqual([...fromTs].sort());
    }
  });
});
