export const TIME_DIAL_STEP_MINUTES = 5;
export const TIME_DIAL_CENTER = 90;
export const TIME_DIAL_RADIUS = 72;
export const TIME_DIAL_OUTER_RADIUS = 60;
export const TIME_DIAL_INNER_RADIUS = 34;
export const TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS = (TIME_DIAL_OUTER_RADIUS + TIME_DIAL_INNER_RADIUS) / 2;

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

export function angleToMinutes(angleDeg: number, radius: number, mode: TimeDialMode, currentMinutes: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;

  if (mode === "hour") {
    const hour = angleAndRadiusToHour(normalizedAngle, radius);
    return hour * 60 + (currentMinutes % 60);
  }

  const minute = (Math.round((normalizedAngle / 360) * 60 / TIME_DIAL_STEP_MINUTES) * TIME_DIAL_STEP_MINUTES) % 60;
  return Math.floor(currentMinutes / 60) * 60 + minute;
}

/**
 * 「時」モードの二重リング判定。12方向(30度刻み)のうちどこに一番近いかを角度から求め、
 * 中心からの距離が境界半径より外なら外側の値(1〜12)、内なら内側の値(13〜23・00)を返す。
 */
export function angleAndRadiusToHour(angleDeg: number, radius: number): number {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const i = Math.round(normalizedAngle / 30) % 12;
  const base = i === 0 ? 12 : i;
  const isOuter = radius > TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS;
  if (isOuter) {
    return base;
  }
  return base === 12 ? 0 : base + 12;
}

/** ある時刻(0〜23時)が、外側リング(1〜12)と内側リング(13〜23・00)のどちらに属するか。 */
export function hourIsOuterRing(hour: number): boolean {
  return hour >= 1 && hour <= 12;
}

/** ある時刻(0〜23時)を、対応する12方向の角度(度)に変換する。1時と13時は同じ角度になる。 */
export function hourAngleDeg(hour: number): number {
  const i = hour % 12;
  return (i / 12) * 360;
}

export type HourDialPosition = {
  angleDeg: number;
  outerValue: number;
  innerValue: number;
  /** false の位置は、選択されているときだけ内側の数字を表示する(常時表示すると窮屈になるため)。 */
  innerAlwaysVisible: boolean;
};

const HOUR_DIAL_INNER_MAJOR_POSITIONS = new Set([0, 3, 6, 9]);

/** 12方向ぶんの外側/内側の値のペアを返す。数字の配置・常時表示するかどうかの判定に使う。 */
export function buildHourDialPositions(): HourDialPosition[] {
  const positions: HourDialPosition[] = [];
  for (let i = 0; i < 12; i++) {
    positions.push({
      angleDeg: (i / 12) * 360,
      outerValue: i === 0 ? 12 : i,
      innerValue: i === 0 ? 0 : i + 12,
      innerAlwaysVisible: HOUR_DIAL_INNER_MAJOR_POSITIONS.has(i)
    });
  }
  return positions;
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
    const radius = hourIsOuterRing(hour) ? TIME_DIAL_OUTER_RADIUS : TIME_DIAL_INNER_RADIUS;
    return pointForAngleDeg(hourAngleDeg(hour), radius);
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
