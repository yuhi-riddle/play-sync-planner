export const TIME_DIAL_STEP_MINUTES = 5;
export const TIME_DIAL_CENTER = 90;
export const TIME_DIAL_RADIUS = 72;

export type TimeDialMode = "hour" | "minute";

export type DialPoint = { x: number; y: number };

export function parseTimeToMinutes(value: string): number {
  const [hourText, minuteText] = value.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function angleToMinutes(angleDeg: number, mode: TimeDialMode, currentMinutes: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;

  if (mode === "hour") {
    const hour = Math.round((normalizedAngle / 360) * 24) % 24;
    return hour * 60 + (currentMinutes % 60);
  }

  const minute = (Math.round((normalizedAngle / 360) * 60 / TIME_DIAL_STEP_MINUTES) * TIME_DIAL_STEP_MINUTES) % 60;
  return Math.floor(currentMinutes / 60) * 60 + minute;
}

export function pointForAngleDeg(angleDeg: number, radius: number): DialPoint {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: TIME_DIAL_CENTER + radius * Math.cos(angleRad),
    y: TIME_DIAL_CENTER + radius * Math.sin(angleRad)
  };
}

export function clientPointToAngleDeg(localX: number, localY: number): number {
  const dx = localX - TIME_DIAL_CENTER;
  const dy = localY - TIME_DIAL_CENTER;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  return ((angle % 360) + 360) % 360;
}

export function handPointForMinutes(minutes: number, mode: TimeDialMode): DialPoint {
  if (mode === "hour") {
    const hour = Math.floor(minutes / 60);
    return pointForAngleDeg((hour / 24) * 360, TIME_DIAL_RADIUS - 4);
  }
  const minute = minutes % 60;
  return pointForAngleDeg((minute / 60) * 360, TIME_DIAL_RADIUS - 4);
}

export function buildDialTicks(mode: TimeDialMode): { x1: number; y1: number; x2: number; y2: number }[] {
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];

  if (mode === "hour") {
    for (let hour = 0; hour < 24; hour++) {
      const angleDeg = (hour / 24) * 360;
      const inner = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS - (hour % 6 === 0 ? 10 : 6));
      const outer = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS + 2);
      ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
    }
    return ticks;
  }

  for (let minute = 0; minute < 60; minute += 5) {
    const angleDeg = (minute / 60) * 360;
    const inner = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS - (minute % 15 === 0 ? 10 : 6));
    const outer = pointForAngleDeg(angleDeg, TIME_DIAL_RADIUS + 2);
    ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
  }
  return ticks;
}

export function buildDialTickLabels(mode: TimeDialMode): { x: number; y: number; label: string }[] {
  const values = mode === "hour" ? [0, 6, 12, 18] : [0, 15, 30, 45];
  const total = mode === "hour" ? 24 : 60;
  return values.map((value) => {
    const point = pointForAngleDeg((value / total) * 360, TIME_DIAL_RADIUS - 22);
    return { x: point.x, y: point.y, label: String(value).padStart(2, "0") };
  });
}
