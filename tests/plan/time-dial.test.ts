import { describe, expect, it } from "vitest";

import {
  TIME_DIAL_STEP_MINUTES,
  TIME_DIAL_OUTER_RADIUS,
  TIME_DIAL_INNER_RADIUS,
  TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS,
  angleToMinutes,
  angleAndRadiusToHour,
  buildDialTickLabels,
  buildDialTicks,
  buildHourDialPositions,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  hourAngleDeg,
  hourIsOuterRing,
  parseTimeToMinutes,
  pointForAngleDeg
} from "@/lib/domain/plan/time-dial";

describe("time-dial", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("19:05")).toBe(19 * 60 + 5);
    expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("formats minutes back into HH:MM, wrapping at 24h", () => {
    expect(formatMinutesToTime(0)).toBe("00:00");
    expect(formatMinutesToTime(19 * 60 + 5)).toBe("19:05");
    expect(formatMinutesToTime(24 * 60)).toBe("00:00");
    expect(formatMinutesToTime(-5)).toBe("23:55");
  });

  it("外側リング(1〜12)は輪の縁寄り、内側リング(13〜23・00)は中心寄りをタップ/ドラッグしたときに選ばれる", () => {
    // 90度は「3時/15時」の位置。輪の縁寄り(半径60、境界47より外)なら3時。
    expect(angleToMinutes(90, TIME_DIAL_OUTER_RADIUS, "hour", 19 * 60 + 30)).toBe(3 * 60 + 30);
    // 中心寄り(半径34、境界47より内)なら15時。
    expect(angleToMinutes(90, TIME_DIAL_INNER_RADIUS, "hour", 19 * 60 + 30)).toBe(15 * 60 + 30);
    // 0度(12時位置)の外側は12時、内側は00時。
    expect(angleToMinutes(0, TIME_DIAL_OUTER_RADIUS, "hour", 19 * 60 + 30)).toBe(12 * 60 + 30);
    expect(angleToMinutes(0, TIME_DIAL_INNER_RADIUS, "hour", 19 * 60 + 30)).toBe(0 * 60 + 30);
  });

  it("converts a drag angle to a minute, snapping to 5-minute steps and keeping the current hour", () => {
    expect(TIME_DIAL_STEP_MINUTES).toBe(5);
    // 分モードでは半径は無視される。
    expect(angleToMinutes(23, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 5);
    expect(angleToMinutes(0, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 0);
    expect(angleToMinutes(180, TIME_DIAL_OUTER_RADIUS, "minute", 19 * 60 + 0)).toBe(19 * 60 + 30);
  });

  it("computes a point on the dial from an angle and radius", () => {
    const top = pointForAngleDeg(0, 72);
    expect(top.x).toBeCloseTo(90);
    expect(top.y).toBeCloseTo(90 - 72);

    const right = pointForAngleDeg(90, 72);
    expect(right.x).toBeCloseTo(90 + 72);
    expect(right.y).toBeCloseTo(90);
  });

  it("computes the angle from a local point, with 12-o'clock as 0 degrees", () => {
    expect(clientPointToAngleDeg(90, 90 - 72)).toBeCloseTo(0);
    expect(clientPointToAngleDeg(90 + 72, 90)).toBeCloseTo(90);
  });

  it("computes the hand point for hour and minute modes", () => {
    // 6時は外側リング、角度は(6%12/12)*360=180度。
    const hourHandOuter = handPointForMinutes(6 * 60, "hour");
    expect(hourHandOuter.x).toBeCloseTo(90, 0);
    expect(hourHandOuter.y).toBeCloseTo(90 + TIME_DIAL_OUTER_RADIUS, 0);

    // 15時は内側リング、角度は(3/12)*360=90度。
    const hourHandInner = handPointForMinutes(15 * 60, "hour");
    expect(hourHandInner.x).toBeCloseTo(90 + TIME_DIAL_INNER_RADIUS, 0);
    expect(hourHandInner.y).toBeCloseTo(90, 0);

    const minuteHand = handPointForMinutes(19 * 60 + 30, "minute");
    expect(minuteHand.x).toBeCloseTo(90, 0);
    expect(minuteHand.y).toBeCloseTo(90 + 68, 0);
  });

  it("builds 24 hour ticks and 12 minute ticks", () => {
    expect(buildDialTicks("hour")).toHaveLength(24);
    expect(buildDialTicks("minute")).toHaveLength(12);
  });

  it("builds the four major labels for each mode", () => {
    expect(buildDialTickLabels("hour").map((l) => l.label)).toEqual(["00", "06", "12", "18"]);
    expect(buildDialTickLabels("minute").map((l) => l.label)).toEqual(["00", "15", "30", "45"]);
  });

  it("hourAngleDeg maps 1〜12時と13〜23・00時を12方向・同じ角度に対応させる", () => {
    expect(hourAngleDeg(12)).toBeCloseTo(0);
    expect(hourAngleDeg(0)).toBeCloseTo(0);
    expect(hourAngleDeg(3)).toBeCloseTo(90);
    expect(hourAngleDeg(15)).toBeCloseTo(90);
    expect(hourAngleDeg(9)).toBeCloseTo(270);
    expect(hourAngleDeg(21)).toBeCloseTo(270);
  });

  it("hourIsOuterRing は1〜12時だけtrueを返す", () => {
    expect(hourIsOuterRing(1)).toBe(true);
    expect(hourIsOuterRing(12)).toBe(true);
    expect(hourIsOuterRing(0)).toBe(false);
    expect(hourIsOuterRing(13)).toBe(false);
    expect(hourIsOuterRing(23)).toBe(false);
  });

  it("angleAndRadiusToHour は角度と半径の組み合わせで0〜23時を一意に返す", () => {
    expect(angleAndRadiusToHour(0, TIME_DIAL_OUTER_RADIUS)).toBe(12);
    expect(angleAndRadiusToHour(0, TIME_DIAL_INNER_RADIUS)).toBe(0);
    expect(angleAndRadiusToHour(330, TIME_DIAL_OUTER_RADIUS)).toBe(11);
    expect(angleAndRadiusToHour(330, TIME_DIAL_INNER_RADIUS)).toBe(23);
    // 境界ちょうどは外側扱い(> ではなく >= でないことを明示するテスト)
    expect(angleAndRadiusToHour(90, TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS)).toBe(15);
    expect(angleAndRadiusToHour(90, TIME_DIAL_HOUR_ZONE_BOUNDARY_RADIUS + 0.01)).toBe(3);
  });

  it("buildHourDialPositions は12方向ぶんの外側/内側の値と、内側の常時表示フラグを返す", () => {
    const positions = buildHourDialPositions();
    expect(positions).toHaveLength(12);
    expect(positions[0]).toEqual({ angleDeg: 0, outerValue: 12, innerValue: 0, innerAlwaysVisible: true });
    expect(positions[1]).toEqual({ angleDeg: 30, outerValue: 1, innerValue: 13, innerAlwaysVisible: false });
    expect(positions[3]).toEqual({ angleDeg: 90, outerValue: 3, innerValue: 15, innerAlwaysVisible: true });
    expect(positions[9]).toEqual({ angleDeg: 270, outerValue: 9, innerValue: 21, innerAlwaysVisible: true });
  });
});
