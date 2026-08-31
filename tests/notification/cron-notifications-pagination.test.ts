import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminClient } = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  hasSupabaseAdminEnv: () => true
}));

import { GET } from "@/app/api/cron/notifications/route";

function request() {
  return new NextRequest("http://localhost/api/cron/notifications", {
    headers: { authorization: "Bearer test-secret" }
  });
}

/**
 * plans を id キーセットでページングするクライアントのモック。
 * pages: 各ページで返す plan 行の配列。最後のページが PAGE_SIZE 未満なら打ち切られる。
 */
function paginatingClient(pages: Array<Array<{ id: string }>>) {
  const gtCalls: string[] = [];
  let pageIndex = 0;

  const from = vi.fn((table: string) => {
    if (table === "notifications") {
      return { upsert: vi.fn(async () => ({ error: null })) };
    }

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.in = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.gt = vi.fn((_column: string, value: string) => {
      gtCalls.push(value);
      return builder;
    });
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const data = pages[pageIndex] ?? [];
      pageIndex += 1;
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return builder;
  });

  return { client: { from }, gtCalls };
}

describe("GET /api/cron/notifications pagination", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("200 件を超える plan を全ページ走査する（limit 200 で打ち切らない）", async () => {
    const fullPage = (offset: number) =>
      Array.from({ length: 200 }, (_, i) => ({ id: `plan-${String(offset + i).padStart(4, "0")}` }));
    const { client, gtCalls } = paginatingClient([fullPage(0), fullPage(200), [{ id: "plan-0400" }]]);
    createSupabaseAdminClient.mockReturnValue(client);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plansScanned).toBe(401);
    // 2 回目・3 回目の取得は前ページ末尾 id をカーソルにする
    expect(gtCalls).toEqual(["plan-0199", "plan-0399"]);
  });

  it("1 ページに収まるときは 1 回だけ取得する", async () => {
    const { client, gtCalls } = paginatingClient([[{ id: "plan-0001" }, { id: "plan-0002" }]]);
    createSupabaseAdminClient.mockReturnValue(client);

    const response = await GET(request());
    const body = await response.json();

    expect(body.plansScanned).toBe(2);
    expect(gtCalls).toEqual([]);
  });
});
