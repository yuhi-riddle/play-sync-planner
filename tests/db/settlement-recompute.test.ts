import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  calculateSettlementTransfers,
  type ExpenseForSettlement,
  type SettlementParticipant,
  type SettlementTransfer
} from "@/lib/domain/settlement/settlement";

type ScenarioExpense = {
  payer: number;
  amount: number;
  splits: Array<{ participant: number; amount: number }>;
};

type Scenario = {
  participantNames: string[];
  expenses: ScenarioExpense[];
};

type PlanFixture = {
  ownerId: string;
  planId: string;
  participants: SettlementParticipant[];
  expenses: ExpenseForSettlement[];
};

type DbClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
}) as DbClient;

async function insertPlanFixture(scenario: Scenario): Promise<PlanFixture> {
  const ownerId = randomUUID();
  const eventId = randomUUID();
  const planId = randomUUID();

  await client.query("insert into auth.users (id, email) values ($1, $2)", [ownerId, `${ownerId}@example.com`]);
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerId]);
  await client.query(
    "insert into public.events (id, owner_user_id, title) values ($1, $2, $3)",
    [eventId, ownerId, "DB settlement test"]
  );
  await client.query(
    "insert into public.plans (id, event_id, owner_user_id, title) values ($1, $2, $3, $4)",
    [planId, eventId, ownerId, "DB settlement test"]
  );

  const participants: SettlementParticipant[] = [];
  for (const [index, name] of scenario.participantNames.entries()) {
    const id = randomUUID();
    const displayName = `${String(index + 1).padStart(2, "0")}-${name}`;
    await client.query(
      "insert into public.participants (id, plan_id, display_name) values ($1, $2, $3)",
      [id, planId, displayName]
    );
    participants.push({ id, displayName });
  }

  const expenses: ExpenseForSettlement[] = [];
  for (const [index, expense] of scenario.expenses.entries()) {
    const expenseId = randomUUID();
    await client.query(
      `insert into public.expenses (id, plan_id, payer_participant_id, title, amount)
       values ($1, $2, $3, $4, $5)`,
      [expenseId, planId, participants[expense.payer].id, `Expense ${index + 1}`, expense.amount]
    );

    const splits = expense.splits.map((split) => ({
      participantId: participants[split.participant].id,
      amount: split.amount
    }));
    for (const split of splits) {
      await client.query(
        "insert into public.expense_splits (expense_id, participant_id, amount) values ($1, $2, $3)",
        [expenseId, split.participantId, split.amount]
      );
    }

    expenses.push({
      id: expenseId,
      payerParticipantId: participants[expense.payer].id,
      amount: expense.amount,
      splits
    });
  }

  return { ownerId, planId, participants, expenses };
}

async function readUnpaidTransfers(planId: string): Promise<SettlementTransfer[]> {
  const result = await client.query<{
    from_participant_id: string;
    to_participant_id: string;
    amount: number;
  }>(
    `select from_participant_id, to_participant_id, amount
     from public.settlements
     where plan_id = $1 and status = 'unpaid'
     order by ctid`,
    [planId]
  );

  return result.rows.map((row) => ({
    fromParticipantId: row.from_participant_id,
    toParticipantId: row.to_participant_id,
    amount: row.amount
  }));
}

const scenarios: Array<{ name: string; input: Scenario }> = [
  {
    name: "single creditor and debtor",
    input: {
      participantNames: ["Alice", "Bob"],
      expenses: [
        {
          payer: 0,
          amount: 1_000,
          splits: [
            { participant: 0, amount: 500 },
            { participant: 1, amount: 500 }
          ]
        }
      ]
    }
  },
  {
    name: "multiple creditors and debtors",
    input: {
      participantNames: ["Alice", "Bob", "Chika", "Dai"],
      expenses: [
        {
          payer: 0,
          amount: 1_000,
          splits: [
            { participant: 0, amount: 100 },
            { participant: 1, amount: 300 },
            { participant: 2, amount: 300 },
            { participant: 3, amount: 300 }
          ]
        },
        {
          payer: 1,
          amount: 800,
          splits: [
            { participant: 0, amount: 100 },
            { participant: 1, amount: 100 },
            { participant: 2, amount: 300 },
            { participant: 3, amount: 300 }
          ]
        }
      ]
    }
  },
  {
    name: "uneven splits with one-yen remainders",
    input: {
      participantNames: ["Alice", "Bob", "Chika"],
      expenses: [
        {
          payer: 2,
          amount: 1_000,
          splits: [
            { participant: 0, amount: 334 },
            { participant: 1, amount: 333 },
            { participant: 2, amount: 333 }
          ]
        }
      ]
    }
  },
  {
    name: "everyone has an even zero balance",
    input: {
      participantNames: ["Alice", "Bob", "Chika"],
      expenses: [
        { payer: 0, amount: 300, splits: [{ participant: 0, amount: 300 }] },
        { payer: 1, amount: 300, splits: [{ participant: 1, amount: 300 }] },
        { payer: 2, amount: 300, splits: [{ participant: 2, amount: 300 }] }
      ]
    }
  },
  {
    name: "three-plus participants net several expenses",
    input: {
      participantNames: ["Alice", "Bob", "Chika", "Dai", "Emi"],
      expenses: [
        {
          payer: 0,
          amount: 2_500,
          splits: [
            { participant: 0, amount: 500 },
            { participant: 1, amount: 500 },
            { participant: 2, amount: 500 },
            { participant: 3, amount: 500 },
            { participant: 4, amount: 500 }
          ]
        },
        {
          payer: 3,
          amount: 1_201,
          splits: [
            { participant: 0, amount: 241 },
            { participant: 1, amount: 240 },
            { participant: 2, amount: 240 },
            { participant: 3, amount: 240 },
            { participant: 4, amount: 240 }
          ]
        }
      ]
    }
  }
];

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe("recompute_plan_settlements", () => {
  it.each(scenarios)("matches calculateSettlementTransfers: $name", async ({ input }) => {
    await client.query("begin");
    try {
      const fixture = await insertPlanFixture(input);
      const expected = calculateSettlementTransfers(fixture);

      await client.query("select public.recompute_plan_settlements($1)", [fixture.planId]);

      expect(await readUnpaidTransfers(fixture.planId)).toEqual(expected);
      const plan = await client.query<{ settlement_status: string }>(
        "select settlement_status from public.plans where id = $1",
        [fixture.planId]
      );
      expect(plan.rows[0].settlement_status).toBe(expected.length > 0 ? "needed" : "not_needed");
    } finally {
      await client.query("rollback");
    }
  });

  it("rejects a bad split and leaves existing settlements unchanged", async () => {
    await client.query("begin");
    try {
      const fixture = await insertPlanFixture({
        participantNames: ["Alice", "Bob"],
        expenses: [
          {
            payer: 0,
            amount: 1_000,
            splits: [
              { participant: 0, amount: 400 },
              { participant: 1, amount: 500 }
            ]
          }
        ]
      });
      const settlementId = randomUUID();
      await client.query(
        `insert into public.settlements
           (id, plan_id, from_participant_id, to_participant_id, amount, status)
         values ($1, $2, $3, $4, $5, 'unpaid')`,
        [settlementId, fixture.planId, fixture.participants[1].id, fixture.participants[0].id, 777]
      );
      await client.query("savepoint before_recompute");

      await expect(
        client.query("select public.recompute_plan_settlements($1)", [fixture.planId])
      ).rejects.toThrow(/split amounts/i);
      await client.query("rollback to savepoint before_recompute");

      const settlements = await client.query<{ id: string; amount: number }>(
        "select id, amount from public.settlements where plan_id = $1",
        [fixture.planId]
      );
      expect(settlements.rows).toEqual([{ id: settlementId, amount: 777 }]);
    } finally {
      await client.query("rollback");
    }
  });

  it.each(["payer", "split"] as const)("rejects a %s participant from another plan", async (reference) => {
    await client.query("begin");
    try {
      const fixture = await insertPlanFixture({
        participantNames: ["Alice", "Bob"],
        expenses: [
          {
            payer: 0,
            amount: 1_000,
            splits: [
              { participant: 0, amount: 500 },
              { participant: 1, amount: 500 }
            ]
          }
        ]
      });
      const otherPlan = await insertPlanFixture({ participantNames: ["Outsider"], expenses: [] });
      const outsiderId = otherPlan.participants[0].id;
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [fixture.ownerId]);

      if (reference === "payer") {
        await client.query("update public.expenses set payer_participant_id = $1 where plan_id = $2", [
          outsiderId,
          fixture.planId
        ]);
      } else {
        // 1 行だけ差し替える。全行を同じ id にすると expense_splits_unique に当たる。
        await client.query(
          "update public.expense_splits set participant_id = $1 where expense_id = $2 and participant_id = $3",
          [outsiderId, fixture.expenses[0].id, fixture.participants[1].id]
        );
      }

      await expect(
        client.query("select public.recompute_plan_settlements($1)", [fixture.planId])
      ).rejects.toThrow(/participant does not belong to plan/i);
    } finally {
      await client.query("rollback");
    }
  });
});
