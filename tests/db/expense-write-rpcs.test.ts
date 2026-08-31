import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { calculateSettlementTransfers } from "@/lib/domain/settlement/settlement";

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

type Plan = {
  ownerId: string;
  planId: string;
  participantIds: string[];
};

async function makePlan(participantCount: number): Promise<Plan> {
  const ownerId = randomUUID();
  const eventId = randomUUID();
  const planId = randomUUID();

  await client.query("insert into auth.users (id, email) values ($1, $2)", [ownerId, `${ownerId}@example.com`]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
  await client.query("insert into public.events (id, owner_user_id, title) values ($1, $2, 'expense rpc test')", [
    eventId,
    ownerId
  ]);
  await client.query("insert into public.plans (id, event_id, owner_user_id, title) values ($1, $2, $3, 'expense rpc test')", [
    planId,
    eventId,
    ownerId
  ]);

  const participantIds: string[] = [];
  for (let i = 0; i < participantCount; i += 1) {
    const id = randomUUID();
    await client.query("insert into public.participants (id, plan_id, display_name) values ($1, $2, $3)", [
      id,
      planId,
      `${String(i + 1).padStart(2, "0")}-participant`
    ]);
    participantIds.push(id);
  }

  return { ownerId, planId, participantIds };
}

function splitsJson(entries: Array<[participantId: string, amount: number]>) {
  return JSON.stringify(entries.map(([participant_id, amount]) => ({ participant_id, amount })));
}

/**
 * RPC が raise する想定のクエリを、savepoint で囲んで実行する。
 * raise でトランザクションが中断されるので、savepoint まで戻してから後続の検証を続ける。
 */
async function expectRpcRejects(sql: string, params: unknown[], matcher: RegExp) {
  await client.query("savepoint sp");
  await expect(client.query(sql, params)).rejects.toThrow(matcher);
  await client.query("rollback to savepoint sp");
}

async function readExpenses(planId: string) {
  const { rows } = await client.query<{ id: string; amount: number; payer_participant_id: string; title: string }>(
    "select id, amount, payer_participant_id, title from public.expenses where plan_id = $1 order by created_at, id",
    [planId]
  );
  return rows;
}

async function readSplits(expenseId: string) {
  const { rows } = await client.query<{ participant_id: string; amount: number }>(
    "select participant_id, amount from public.expense_splits where expense_id = $1 order by participant_id",
    [expenseId]
  );
  return rows;
}

async function readSettlements(planId: string) {
  const { rows } = await client.query<{
    from_participant_id: string;
    to_participant_id: string;
    amount: number;
    status: string;
  }>(
    "select from_participant_id, to_participant_id, amount, status from public.settlements where plan_id = $1 order by ctid",
    [planId]
  );
  return rows;
}

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

// 各テストはトランザクション内で完結させ、最後に必ず rollback する。
beforeEach(async () => {
  await client.query("begin");
});

afterEach(async () => {
  await client.query("rollback");
});

describe("create_expense", () => {
  it("費用・分担を書き、精算を再計算する（TS の calculateSettlementTransfers と一致）", async () => {
    const plan = await makePlan(3);
    const [a, b, c] = plan.participantIds;

    const { rows } = await client.query<{ create_expense: string }>(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as create_expense",
      [plan.planId, a, "宿", 3000, null, null, false, splitsJson([[a, 1000], [b, 1000], [c, 1000]])]
    );
    const expenseId = rows[0].create_expense;

    expect(await readSplits(expenseId)).toHaveLength(3);

    const expected = calculateSettlementTransfers({
      participants: plan.participantIds.map((id) => ({ id, displayName: id })),
      expenses: [
        {
          id: expenseId,
          payerParticipantId: a,
          amount: 3000,
          splits: [
            { participantId: a, amount: 1000 },
            { participantId: b, amount: 1000 },
            { participantId: c, amount: 1000 }
          ]
        }
      ]
    });

    const settlements = await readSettlements(plan.planId);
    expect(
      settlements.map((s) => ({ fromParticipantId: s.from_participant_id, toParticipantId: s.to_participant_id, amount: s.amount }))
    ).toEqual(expected);

    const status = await client.query<{ settlement_status: string }>(
      "select settlement_status from public.plans where id = $1",
      [plan.planId]
    );
    expect(status.rows[0].settlement_status).toBe("needed");
  });

  it("分担合計が費用額と一致しないと raise し、費用は 1 件も残らない", async () => {
    const plan = await makePlan(2);
    const [a, b] = plan.participantIds;

    await expectRpcRejects(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [plan.planId, a, "ずれ", 1000, null, null, false, splitsJson([[a, 400], [b, 500]])],
      /sum to the expense amount/i
    );

    expect(await readExpenses(plan.planId)).toEqual([]);
  });

  it("その plan に清算支払いが既にあると raise し、費用は残らない", async () => {
    const plan = await makePlan(2);
    const [a, b] = plan.participantIds;

    const settlementId = randomUUID();
    await client.query(
      `insert into public.settlements (id, plan_id, from_participant_id, to_participant_id, amount, status)
       values ($1,$2,$3,$4,$5,'unpaid')`,
      [settlementId, plan.planId, b, a, 500]
    );
    await client.query(
      "insert into public.settlement_payments (settlement_id, paid_by_participant_id, amount) values ($1,$2,$3)",
      [settlementId, b, 100]
    );

    await expectRpcRejects(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [plan.planId, a, "遅れて追加", 1000, null, null, false, splitsJson([[a, 500], [b, 500]])],
      /清算支払いが始まっている/
    );

    expect(await readExpenses(plan.planId)).toEqual([]);
  });

  it("plan 所有者でない auth.uid では raise する", async () => {
    const plan = await makePlan(2);
    const [a, b] = plan.participantIds;
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [randomUUID()]);

    await expectRpcRejects(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
      [plan.planId, a, "他人", 1000, null, null, false, splitsJson([[a, 500], [b, 500]])],
      /主催者だけ/
    );

    expect(await readExpenses(plan.planId)).toEqual([]);
  });
});

describe("update_expense", () => {
  it("分担を入れ替え、精算を再計算する", async () => {
    const plan = await makePlan(3);
    const [a, b, c] = plan.participantIds;

    const created = await client.query<{ create_expense: string }>(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as create_expense",
      [plan.planId, a, "初期", 3000, null, null, false, splitsJson([[a, 1000], [b, 1000], [c, 1000]])]
    );
    const expenseId = created.rows[0].create_expense;

    await client.query("select public.update_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb)", [
      expenseId,
      b,
      "更新後",
      2000,
      null,
      null,
      true,
      splitsJson([[a, 1000], [b, 1000]])
    ]);

    const expenses = await readExpenses(plan.planId);
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ amount: 2000, payer_participant_id: b, title: "更新後" });
    const splits = await readSplits(expenseId);
    expect(splits).toHaveLength(2);
    expect(splits).toEqual(
      expect.arrayContaining([
        { participant_id: a, amount: 1000 },
        { participant_id: b, amount: 1000 }
      ])
    );

    // b が 2000 立て替え、a と b が 1000 ずつ負担 → a が b に 1000
    const settlements = await readSettlements(plan.planId);
    expect(settlements).toEqual([
      { from_participant_id: a, to_participant_id: b, amount: 1000, status: "unpaid" }
    ]);
  });
});

describe("delete_expense", () => {
  it("費用と分担を消し（FK cascade）、精算を再計算する", async () => {
    const plan = await makePlan(3);
    const [a, b, c] = plan.participantIds;

    const created = await client.query<{ create_expense: string }>(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as create_expense",
      [plan.planId, a, "消す対象", 3000, null, null, false, splitsJson([[a, 1000], [b, 1000], [c, 1000]])]
    );
    const expenseId = created.rows[0].create_expense;
    expect(await readSettlements(plan.planId)).not.toHaveLength(0);

    await client.query("select public.delete_expense($1)", [expenseId]);

    expect(await readExpenses(plan.planId)).toEqual([]);
    const { rows: splitRows } = await client.query("select 1 from public.expense_splits where expense_id = $1", [expenseId]);
    expect(splitRows).toHaveLength(0);
    // 費用が無くなったので精算も無くなり、plan は not_needed に戻る
    expect(await readSettlements(plan.planId)).toEqual([]);
    const status = await client.query<{ settlement_status: string }>(
      "select settlement_status from public.plans where id = $1",
      [plan.planId]
    );
    expect(status.rows[0].settlement_status).toBe("not_needed");
  });

  it("清算が paid になっている plan では削除を拒否する", async () => {
    const plan = await makePlan(2);
    const [a, b] = plan.participantIds;

    const created = await client.query<{ create_expense: string }>(
      "select public.create_expense($1,$2,$3,$4,$5,$6,$7,$8::jsonb) as create_expense",
      [plan.planId, a, "対象", 1000, null, null, false, splitsJson([[a, 500], [b, 500]])]
    );
    const expenseId = created.rows[0].create_expense;
    await client.query("update public.settlements set status = 'paid' where plan_id = $1", [plan.planId]);

    await expectRpcRejects("select public.delete_expense($1)", [expenseId], /支払い済みの清算がある/);

    expect(await readExpenses(plan.planId)).toHaveLength(1);
  });
});
