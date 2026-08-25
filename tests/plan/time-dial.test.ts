import { describe, expect, it } from "vitest";

import {
  TIME_DIAL_STEP_MINUTES,
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
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

  it("converts a drag angle to an hour, keeping the current minute", () => {
    // 0度 = 0時、90度 = 6時、180度 = 12時、270度 = 18時
    expect(angleToMinutes(0, "hour", 19 * 60 + 30)).toBe(0 * 60 + 30);
    expect(angleToMinutes(90, "hour", 19 * 60 + 30)).toBe(6 * 60 + 30);
    expect(angleToMinutes(180, "hour", 19 * 60 + 30)).toBe(12 * 60 + 30);
  });

  it("converts a drag angle to a minute, snapping to 5-minute steps and keeping the current hour", () => {
    expect(TIME_DIAL_STEP_MINUTES).toBe(5);
    // 60分を360度とすると、1分=6度。120度は20分にマップされる
    expect(angleToMinutes(120, "minute", 19 * 60 + 0)).toBe(19 * 60 + 20);
    expect(angleToMinutes(0, "minute", 19 * 60 + 0)).toBe(19 * 60 + 0);
    expect(angleToMinutes(180, "minute", 19 * 60 + 0)).toBe(19 * 60 + 30);
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
    const hourHand = handPointForMinutes(6 * 60, "hour");
    expect(hourHand.x).toBeCloseTo(90 + 68, 0);
    expect(hourHand.y).toBeCloseTo(90, 0);

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
});
