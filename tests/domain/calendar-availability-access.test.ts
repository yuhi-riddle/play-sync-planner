import { describe, expect, it } from "vitest";

import { canReadGroupAvailability } from "@/lib/domain/calendar-availability-access";

describe("canReadGroupAvailability", () => {
  it.each(["interested", "planning"])("allows the event owner while the event is %s", (eventStatus) => {
    expect(canReadGroupAvailability({ eventStatus, isOwner: true })).toBe(true);
  });

  it.each(["confirmed", "done", "cancelled", "skipped", null])("denies the event owner while the event is %s", (eventStatus) => {
    expect(canReadGroupAvailability({ eventStatus, isOwner: true })).toBe(false);
  });

  it.each(["interested", "planning"])("denies a non-owner while the event is %s", (eventStatus) => {
    expect(canReadGroupAvailability({ eventStatus, isOwner: false })).toBe(false);
  });
});
