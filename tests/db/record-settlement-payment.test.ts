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

type Fixture = {
  ownerId: string;
  planId: string;
  settlementId: string;
  fromParticipantId: string;
  toParticipantId: string;
  fromUserId: string;
};

// owner が主催、from→to に amount 円の unpaid 清算が 1 本ある状態を作る。
async function makeSettlement(amount: number): Promise<Fixture> {
  const ownerId = randomUUID();
  const fromUserId = randomUUID();
  const eventId = randomUUID();
  const planId = randomUUID();
  const settlementId = randomUUID();
  const fromParticipantId = randomUUID();
  const toParticipantId = randomUUID();

  await client.query("insert into auth.users (id, email) values ($1,$2),($3,$4)", [
    ownerId,
    `${ownerId}@e.test`,
    fromUserId,
    `${fromUserId}@e.test`
  ]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
  await client.query("insert into public.events (id, owner_user_id, title) values ($1,$2,'pay rpc')", [eventId, ownerId]);
  await client.query("insert into public.plans (id, event_id, owner_user_id, title) values ($1,$2,$3,'pay rpc')", [
    planId,
    eventId,
    ownerId
  ]);
  await client.query(
    "insert into public.participants (id, plan_id, display_name, user_id) values ($1,$2,'from',$3),($4,$5,'to',null)",
    [fromParticipantId, planId, fromUserId, toParticipantId, planId]
  );
  await client.query(
    `insert into public.settlements (id, plan_id, from_participant_id, to_participant_id, amount, status)
     values ($1,$2,$3,$4,$5,'unpaid')`,
    [settlementId, planId, fromParticipantId, toParticipantId, amount]
  );

  return { ownerId, planId, settlementId, fromParticipantId, toParticipantId, fromUserId };
}

async function readSettlement(id: string) {
  const { rows } = await client.query<{ status: string; paid_at: string | null }>(
    "select status, paid_at from public.settlements where id = $1",
    [id]
  );
  return rows[0];
}

async function readPaymentTotal(settlementId: string) {
  const { rows } = await client.query<{ total: string }>(
    "select coalesce(sum(amount),0)::text as total from public.settlement_payments where settlement_id = $1",
    [settlementId]
  );
  return Number(rows[0].total);
}

async function expectRejects(params: unknown[], matcher: RegExp) {
  await client.query("savepoint sp");
  await expect(
    client.query("select public.record_settlement_payment($1,$2,$3,$4)", params)
  ).rejects.toThrow(matcher);
  await client.query("rollback to savepoint sp");
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

describe("record_settlement_payment", () => {
  it("全額支払いで settlement=paid / paid_at セット / plan=settling", async () => {
    const f = await makeSettlement(1000);

    await client.query("select public.record_settlement_payment($1,$2,$3,$4)", [f.settlementId, 1000, null, null]);

    const s = await readSettlement(f.settlementId);
    expect(s.status).toBe("paid");
    expect(s.paid_at).not.toBeNull();
    expect(await readPaymentTotal(f.settlementId)).toBe(1000);

    const plan = await client.query<{ settlement_status: string }>(
      "select settlement_status from public.plans where id = $1",
      [f.planId]
    );
    expect(plan.rows[0].settlement_status).toBe("settling");
  });

  it("一部支払いでは status は unpaid のまま、paid_at はセットされる", async () => {
    const f = await makeSettlement(1000);

    await client.query("select public.record_settlement_payment($1,$2,$3,$4)", [f.settlementId, 400, null, null]);

    const s = await readSettlement(f.settlementId);
    expect(s.status).toBe("unpaid");
    expect(s.paid_at).not.toBeNull();
    expect(await readPaymentTotal(f.settlementId)).toBe(400);
  });

  it("残額を超える支払いは raise し、何も記録されない", async () => {
    const f = await makeSettlement(1000);
    await client.query("select public.record_settlement_payment($1,$2,$3,$4)", [f.settlementId, 700, null, null]);

    await expectRejects([f.settlementId, 400, null, null], /残額を超えています/);

    expect(await readPaymentTotal(f.settlementId)).toBe(700);
  });

  it("支払う本人（from_participant にひもづくユーザー）は記録できる", async () => {
    const f = await makeSettlement(1000);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [f.fromUserId]);

    await client.query("select public.record_settlement_payment($1,$2,$3,$4)", [f.settlementId, 1000, null, null]);

    expect((await readSettlement(f.settlementId)).status).toBe("paid");
  });

  it("主催者でも支払う本人でもない auth.uid は raise する", async () => {
    const f = await makeSettlement(1000);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);

    await expectRejects([f.settlementId, 1000, null, null], /主催者または支払う本人/);

    expect(await readPaymentTotal(f.settlementId)).toBe(0);
  });
});
