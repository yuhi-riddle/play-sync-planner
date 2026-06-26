import { describe, expect, it } from "vitest";

import { getAfterEventCreatePath } from "@/lib/domain/event-flow";

describe("getAfterEventCreatePath", () => {
  it("sends the user directly to adjustment creation", () => {
    expect(getAfterEventCreatePath("event-1")).toBe("/events/event-1/plans/new");
  });
});
