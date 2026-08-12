import { describe, expect, it } from "vitest";

import {
  buildConfirmedCalendarEvent,
  buildGoogleCalendarShareUrl,
  buildIcsCalendar
} from "@/lib/domain/calendar/calendar-sync";

describe("buildConfirmedCalendarEvent", () => {
  it("uses the plan title, event title, location, and confirmed time range", () => {
    expect(
      buildConfirmedCalendarEvent({
        planTitle: "土曜チーム",
        eventTitle: "謎解き公演",
        locationName: "新宿",
        startAt: "2026-07-01T10:00:00+09:00",
        endAt: "2026-07-01T12:00:00+09:00"
      })
    ).toEqual({
      title: "土曜チーム - 謎解き公演",
      location: "新宿",
      start: "2026-07-01T10:00:00+09:00",
      end: "2026-07-01T12:00:00+09:00"
    });
  });

  it("falls back to the event title and a two hour duration", () => {
    expect(
      buildConfirmedCalendarEvent({
        planTitle: null,
        eventTitle: "謎解き公演",
        locationName: null,
        startAt: "2026-07-01T10:00:00+09:00",
        endAt: null
      })
    ).toEqual({
      title: "謎解き公演",
      location: null,
      start: "2026-07-01T10:00:00+09:00",
      end: "2026-07-01T12:00:00.000+09:00"
    });
  });
});

describe("buildGoogleCalendarShareUrl", () => {
  it("builds a Google Calendar template URL for a confirmed plan", () => {
    const url = new URL(
      buildGoogleCalendarShareUrl({
        title: "Madoi meetup",
        location: "Shinjuku",
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T12:00:00+09:00"
      })
    );

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Madoi meetup");
    expect(url.searchParams.get("location")).toBe("Shinjuku");
    expect(url.searchParams.get("dates")).toBe("20260701T010000Z/20260701T030000Z");
  });
});

describe("buildIcsCalendar", () => {
  const now = new Date("2026-08-11T00:00:00.000Z");

  function lines(ics: string) {
    return ics.split("\r\n");
  }

  it("時刻のある予定をUTCで書き出す", () => {
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: {
        title: "土曜チーム - 謎解き公演",
        location: "新宿",
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T12:00:00+09:00"
      }
    });

    expect(lines(ics)).toEqual(
      expect.arrayContaining([
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:plan-1@madoi",
        "DTSTAMP:20260811T000000Z",
        "DTSTART:20260701T010000Z",
        "DTEND:20260701T030000Z",
        "END:VEVENT",
        "END:VCALENDAR"
      ])
    );
  });

  /*
   * 改行が LF だけだと読み込めないカレンダーアプリがある。
   * 最後の行のあとにも改行が要る。
   */
  it("改行はCRLFで、末尾も改行で終わる", () => {
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: { title: "打ち合わせ", location: null, start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
    });

    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  /*
   * DTEND は「終わりの翌日」を指す。plans.confirmed_end_at は終日のとき
   * すでにその形で入っているので、ここで足し引きしてはいけない。
   * Googleへ送る側も同じ値をそのまま使っている。
   */
  it("終日予定は日付だけで書き、confirmed_end_at をそのまま DTEND にする", () => {
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: {
        title: "合宿",
        location: null,
        start: "2026-07-01T00:00:00+09:00",
        end: "2026-07-03T00:00:00+09:00",
        isAllDay: true
      }
    });

    expect(lines(ics)).toContain("DTSTART;VALUE=DATE:20260701");
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20260703");
    expect(ics).not.toContain("DTSTART:2026");
  });

  /*
   * 題名に「,」や「;」が入っただけで値が割れて読まれる。
   * 「A, B」のような書き方は普通にありえる。
   */
  it("題名と場所の記号をエスケープする", () => {
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: {
        title: "打ち上げ, 二次会あり",
        location: "新宿; 東口",
        start: "2026-07-01T10:00:00+09:00",
        end: "2026-07-01T11:00:00+09:00"
      }
    });

    expect(ics).toContain("SUMMARY:打ち上げ\\, 二次会あり");
    expect(ics).toContain("LOCATION:新宿\\; 東口");
  });

  it("場所が無いときは LOCATION を出さない", () => {
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: { title: "打ち合わせ", location: null, start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
    });

    expect(ics).not.toContain("LOCATION:");
  });

  /*
   * 1行75オクテットまで。日本語は1文字3バイトなので、文字数で数えると簡単に超える。
   * 継続行は先頭の空白1つぶんも数に入る。
   */
  it("長い行を75オクテットで折り返し、マルチバイト文字の途中で割らない", () => {
    const title = "あ".repeat(60);
    const ics = buildIcsCalendar({
      uid: "plan-1@madoi",
      now,
      event: { title, location: null, start: "2026-07-01T10:00:00+09:00", end: "2026-07-01T11:00:00+09:00" }
    });

    const encoder = new TextEncoder();
    for (const line of lines(ics)) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }

    // 折り返しを畳み戻すと元の題名に戻る（＝途中で文字が壊れていない）。
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
  });
});
