import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function makeClient() {
  return new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });
}

// 2 本の接続で同時実行を再現する。setup / teardown は片方で行う。
const a = makeClient();
const b = makeClient();

beforeAll(async () => {
  await a.connect();
  await b.connect();
});
afterAll(async () => {
  await a.end();
  await b.end();
});

async function seedSettlement(amount: number) {
  const ownerId = randomUUID();
  const eventId = randomUUID();
  const planId = randomUUID();
  const fromP = randomUUID();
  const toP = randomUUID();
  const settlementId = randomUUID();

  await a.query("insert into auth.users (id, email) values ($1,$2)", [ownerId, `${ownerId}@e.test`]);
  await a.query("insert into public.events (id, owner_user_id, title) values ($1,$2,'conc')", [eventId, ownerId]);
  await a.query("insert into public.plans (id, event_id, owner_user_id, title) values ($1,$2,$3,'conc')", [
    planId,
    eventId,
    ownerId
  ]);
  await a.query("insert into public.participants (id, plan_id, display_name) values ($1,$2,'from'),($3,$4,'to')", [
    fromP,
    planId,
    toP,
    planId
  ]);
  await a.query(
    `insert into public.settlements (id, plan_id, from_participant_id, to_participant_id, amount, status)
     values ($1,$2,$3,$4,$5,'unpaid')`,
    [settlementId, planId, fromP, toP, amount]
  );
  return { settlementId, fromP };
}

describe("同時実行: 清算支払いの合計は請求額を超えない（migration 021 のトリガー）", () => {
  it("2 接続が残額全額を同時に払おうとしても、後の 1 件はロールバックされる", async () => {
    const { settlementId, fromP } = await seedSettlement(1000);

    await a.query("begin");
    await b.query("begin");

    // A が先に全額を挿入（トリガーが settlement 行をロック）。まだ commit しない。
    await a.query(
      "insert into public.settlement_payments (settlement_id, paid_by_participant_id, amount) values ($1,$2,1000)",
      [settlementId, fromP]
    );

    // B の挿入はトリガーの FOR UPDATE で A の commit を待つ。
    const bInsert = b.query(
      "insert into public.settlement_payments (settlement_id, paid_by_participant_id, amount) values ($1,$2,1000)",
      [settlementId, fromP]
    );

    await a.query("commit");

    // B は A のぶんを見たうえで合計チェックに落ちる。
    await expect(bInsert).rejects.toThrow(/exceed the settlement amount/i);
    await b.query("rollback");

    const { rows } = await a.query<{ total: string; n: string }>(
      "select coalesce(sum(amount),0)::text as total, count(*)::text as n from public.settlement_payments where settlement_id = $1",
      [settlementId]
    );
    expect(rows[0]).toEqual({ total: "1000", n: "1" });

    // 後始末
    await a.query("delete from public.settlement_payments where settlement_id = $1", [settlementId]);
    await a.query("delete from public.settlements where id = $1", [settlementId]);
  });
});
