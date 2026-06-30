export type ConfirmedCalendarEvent = {
  title: string;
  location: string | null;
  start: string;
  end: string;
  isAllDay?: boolean;
};

function addHours(value: string, hours: number) {
  const offsetMatch = value.match(/([+-]\d{2}:\d{2})$/);
  const target = new Date(new Date(value).getTime() + hours * 60 * 60 * 1000);

  if (!offsetMatch) {
    return target.toISOString();
  }

  const suffix = offsetMatch[1];
  const sign = suffix.startsWith("-") ? -1 : 1;
  const [hoursPart, minutesPart] = suffix.slice(1).split(":").map(Number);
  const offsetMinutes = sign * (hoursPart * 60 + minutesPart);
  const local = new Date(target.getTime() + offsetMinutes * 60 * 1000);

  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}T${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}:${String(local.getUTCSeconds()).padStart(2, "0")}.000${suffix}`;
}

export function buildConfirmedCalendarEvent({
  planTitle,
  eventTitle,
  locationName,
  startAt,
  endAt,
  isAllDay = false
}: {
  planTitle?: string | null;
  eventTitle?: string | null;
  locationName?: string | null;
  startAt: string;
  endAt?: string | null;
  isAllDay?: boolean;
}): ConfirmedCalendarEvent {
  const normalizedPlanTitle = planTitle?.trim();
  const normalizedEventTitle = eventTitle?.trim();
  const title =
    normalizedPlanTitle && normalizedEventTitle
      ? `${normalizedPlanTitle} - ${normalizedEventTitle}`
      : normalizedPlanTitle || normalizedEventTitle || "Madoiの予定";

  return {
    title,
    location: locationName?.trim() || null,
    start: startAt,
    end: endAt || addHours(startAt, 2),
    ...(isAllDay ? { isAllDay } : {})
  };
}
