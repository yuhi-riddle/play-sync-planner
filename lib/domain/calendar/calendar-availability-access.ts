type CalendarAvailabilityAccess = {
  eventStatus: string | null | undefined;
  isOwner: boolean;
};

export function canReadGroupAvailability({ eventStatus, isOwner }: CalendarAvailabilityAccess) {
  return isOwner && (eventStatus === "interested" || eventStatus === "planning");
}
