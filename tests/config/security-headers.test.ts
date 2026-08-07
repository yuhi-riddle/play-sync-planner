import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

describe("セキュリティヘッダ", () => {
  it("next.config.tsでは静的ヘッダを持たない(nonce付きCSPを含め、middleware.tsがリクエスト単位で付与する)", async () => {
    expect(nextConfig.headers).toBeUndefined();
  });
});
