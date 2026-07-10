import { describe, expect, it } from "vitest";

import { getAfterEventCreatePath } from "@/lib/domain/event-flow";

describe("getAfterEventCreatePath", () => {
  it("sends the user to the event page so members can join first", () => {
    expect(getAfterEventCreatePath("event-1")).toBe("/events/event-1");
  });
});
