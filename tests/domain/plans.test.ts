import { describe, expect, it } from "vitest";

import { buildAnswerShareLink } from "@/lib/domain/plans";

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
