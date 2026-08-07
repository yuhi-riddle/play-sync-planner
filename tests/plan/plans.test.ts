import { describe, expect, it } from "vitest";

import { buildAnswerShareLink, buildProgressSummaryLine, buildPublicSettlementUrl } from "@/lib/domain/plan/plans";

describe("buildAnswerShareLink", () => {
  it("uses the answer deadline as the share link expiration", () => {
    expect(buildAnswerShareLink("plan-1", "2026-07-01T10:00:00.000Z", () => "token-1")).toEqual({
      plan_id: "plan-1",
      token: "token-1",
      purpose: "answer",
      expires_at: "2026-07-01T10:00:00.000Z"
    });
  });

  it("keeps the share link open when no answer deadline is set", () => {
    expect(buildAnswerShareLink("plan-1", null, () => "token-1")).toEqual({
      plan_id: "plan-1",
      token: "token-1",
      purpose: "answer",
      expires_at: null
    });
  });
});

describe("buildPublicSettlementUrl", () => {
  it("builds a settlement URL from the public answer token", () => {
    expect(buildPublicSettlementUrl("https://madoi.example", "token-1")).toBe("https://madoi.example/s/token-1/settlement");
  });

  it("normalizes trailing slash on the origin", () => {
    expect(buildPublicSettlementUrl("https://madoi.example/", "token-1")).toBe("https://madoi.example/s/token-1/settlement");
  });
});

describe("buildProgressSummaryLine", () => {
  it("does not prompt the owner to confirm an already confirmed plan", () => {
    expect(
      buildProgressSummaryLine({
        total: 3,
        pending: 1,
        deadlineState: "soon",
        answerDeadlineAt: "2026-07-20T18:00:00+09:00",
        isConfirmed: true
      })
    ).toBe("日程は確定済みです。");
  });
});
