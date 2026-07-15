import { describe, expect, it } from "vitest";

import { getAfterEventCreatePath, getEventDraftResumePath, shouldResumeEventDraft } from "@/lib/domain/event-flow";

describe("getAfterEventCreatePath", () => {
  it("sends the user to the event page so members can join first", () => {
    expect(getAfterEventCreatePath("event-1")).toBe("/events/event-1");
  });
});

describe("event draft resume", () => {
  it("resumes a draft only when the query explicitly requests it", () => {
    expect(shouldResumeEventDraft("draft")).toBe(true);
    expect(shouldResumeEventDraft(undefined)).toBe(false);
    expect(shouldResumeEventDraft("true")).toBe(false);
    expect(shouldResumeEventDraft(["draft"])).toBe(false);
  });

  it("provides the explicit resume path used by the home page", () => {
    expect(getEventDraftResumePath()).toBe("/events/new?resume=draft");
  });
});
