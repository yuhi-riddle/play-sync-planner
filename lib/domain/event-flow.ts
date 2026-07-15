export function getAfterEventCreatePath(eventId: string) {
  return `/events/${eventId}`;
}

export function shouldResumeEventDraft(resume: string | string[] | undefined) {
  return resume === "draft";
}

export function getEventDraftResumePath() {
  return "/events/new?resume=draft";
}
