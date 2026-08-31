import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// db-tests は postgres superuser で繋いでいるので、RLS を効かせるには
// トランザクション内で `set local role authenticated`（非superuser/非bypassrls）に
// 切り替え、request.jwt.claim.sub を対象ユーザーに設定する。
const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE
});

type World = {
  ownerId: string;
  memberId: string;
  outsiderId: string;
  eventId: string;
  planId: string;
  ownerParticipantId: string;
  memberParticipantId: string;
  expenseId: string;
  settlementId: string;
  paymentId: string;
};

/** RLS を効かせた状態で、userId 本人として fn を実行する。トランザクションは呼び出し側で管理。 */
async function asUser<T>(userId: string | null, role: "authenticated" | "anon", fn: () => Promise<T>): Promise<T> {
  await client.query("savepoint role_scope");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
  await client.query(`set local role ${role}`);
  try {
    return await fn();
  } finally {
    // rollback to savepoint が set local role / set_config も巻き戻す。
    await client.query("rollback to savepoint role_scope");
  }
}

async function rowCount(sql: string, params: unknown[]) {
  const { rows } = await client.query(sql, params);
  return rows.length;
}

/** superuser のまま（RLS バイパス）で 1 プラン分のデータを作る。 */
async function seedWorld(): Promise<World> {
  const w: World = {
    ownerId: randomUUID(),
    memberId: randomUUID(),
    outsiderId: randomUUID(),
    eventId: randomUUID(),
    planId: randomUUID(),
    ownerParticipantId: randomUUID(),
    memberParticipantId: randomUUID(),
    expenseId: randomUUID(),
    settlementId: randomUUID(),
    paymentId: randomUUID()
  };

  await client.query("insert into auth.users (id, email) values ($1,$2),($3,$4),($5,$6)", [
    w.ownerId,
    `${w.ownerId}@e.test`,
    w.memberId,
    `${w.memberId}@e.test`,
    w.outsiderId,
    `${w.outsiderId}@e.test`
  ]);
  await client.query("insert into public.events (id, owner_user_id, title) values ($1,$2,'RLS test')", [w.eventId, w.ownerId]);
  await client.query("insert into public.plans (id, event_id, owner_user_id, title) values ($1,$2,$3,'RLS test')", [
    w.planId,
    w.eventId,
    w.ownerId
  ]);
  await client.query(
    "insert into public.participants (id, plan_id, user_id, display_name) values ($1,$2,$3,'主催'),($4,$5,$6,'メンバー')",
    [w.ownerParticipantId, w.planId, w.ownerId, w.memberParticipantId, w.planId, w.memberId]
  );
  await client.query(
    "insert into public.expenses (id, plan_id, payer_participant_id, title, amount) values ($1,$2,$3,'宿',2000)",
    [w.expenseId, w.planId, w.ownerParticipantId]
  );
  await client.query(
    "insert into public.expense_splits (expense_id, participant_id, amount) values ($1,$2,1000),($1,$3,1000)",
    [w.expenseId, w.ownerParticipantId, w.memberParticipantId]
  );
  await client.query(
    `insert into public.settlements (id, plan_id, from_participant_id, to_participant_id, amount, status)
     values ($1,$2,$3,$4,1000,'unpaid')`,
    [w.settlementId, w.planId, w.memberParticipantId, w.ownerParticipantId]
  );
  await client.query(
    "insert into public.settlement_payments (id, settlement_id, paid_by_participant_id, amount) values ($1,$2,$3,500)",
    [w.paymentId, w.settlementId, w.memberParticipantId]
  );

  return w;
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

// 各テストは begin してから seedWorld、最後に必ず rollback。
async function withWorld(fn: (w: World) => Promise<void>) {
  const w = await seedWorld();
  try {
    await fn(w);
  } finally {
    await client.query("rollback");
  }
}

describe("RLS: 参加者でも主催者でもない相手には金額も予定名も渡らない", () => {
  it("outsider は event / plan / expenses / settlements / settlement_payments を 1 行も読めない", async () => {
    await withWorld(async (w) => {
      await asUser(w.outsiderId, "authenticated", async () => {
        expect(await rowCount("select 1 from public.events where id = $1", [w.eventId])).toBe(0);
        expect(await rowCount("select 1 from public.plans where id = $1", [w.planId])).toBe(0);
        expect(await rowCount("select 1 from public.expenses where id = $1", [w.expenseId])).toBe(0);
        expect(await rowCount("select 1 from public.settlements where id = $1", [w.settlementId])).toBe(0);
        expect(await rowCount("select 1 from public.settlement_payments where id = $1", [w.paymentId])).toBe(0);
      });
    });
  });

  it("anon は event を 1 行も読めない", async () => {
    await withWorld(async (w) => {
      await asUser(null, "anon", async () => {
        expect(await rowCount("select 1 from public.events where id = $1", [w.eventId])).toBe(0);
      });
    });
  });

  it("参加者は event / plan / expenses / settlements を読める", async () => {
    await withWorld(async (w) => {
      await asUser(w.memberId, "authenticated", async () => {
        expect(await rowCount("select 1 from public.events where id = $1", [w.eventId])).toBe(1);
        expect(await rowCount("select 1 from public.plans where id = $1", [w.planId])).toBe(1);
        expect(await rowCount("select 1 from public.expenses where id = $1", [w.expenseId])).toBe(1);
        expect(await rowCount("select 1 from public.settlements where id = $1", [w.settlementId])).toBe(1);
      });
    });
  });
});

describe("RLS: 書き込みは主催者・本人に固定", () => {
  it("参加者は expenses を insert できない（主催者だけ）", async () => {
    await withWorld(async (w) => {
      await asUser(w.memberId, "authenticated", async () => {
        await expect(
          client.query(
            "insert into public.expenses (plan_id, payer_participant_id, title, amount) values ($1,$2,'不正',100)",
            [w.planId, w.memberParticipantId]
          )
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });

  it("主催者は expenses を insert できる", async () => {
    await withWorld(async (w) => {
      await asUser(w.ownerId, "authenticated", async () => {
        await client.query(
          "insert into public.expenses (plan_id, payer_participant_id, title, amount) values ($1,$2,'追加',300)",
          [w.planId, w.ownerParticipantId]
        );
        expect(await rowCount("select 1 from public.expenses where plan_id = $1", [w.planId])).toBe(2);
      });
    });
  });

  it("支払い本人（from_participant）は settlement_payments を insert できるが、他人はできない", async () => {
    await withWorld(async (w) => {
      await asUser(w.memberId, "authenticated", async () => {
        await client.query(
          "insert into public.settlement_payments (settlement_id, paid_by_participant_id, amount) values ($1,$2,200)",
          [w.settlementId, w.memberParticipantId]
        );
      });
      await asUser(w.outsiderId, "authenticated", async () => {
        await expect(
          client.query(
            "insert into public.settlement_payments (settlement_id, paid_by_participant_id, amount) values ($1,$2,200)",
            [w.settlementId, w.memberParticipantId]
          )
        ).rejects.toThrow(/row-level security/i);
      });
    });
  });
});
