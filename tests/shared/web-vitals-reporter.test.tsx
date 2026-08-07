import React from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useReportWebVitals } = vi.hoisted(() => ({ useReportWebVitals: vi.fn() }));
const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/web-vitals", () => ({ useReportWebVitals }));
vi.mock("next/navigation", () => ({ usePathname }));

import { SAMPLE_RATE, WebVitalsReporter } from "@/components/ui/web-vitals-reporter";

function reportMetric(name: string, value: number) {
  const handler = useReportWebVitals.mock.calls.at(-1)?.[0];
  handler?.({ name, value });
}

// next/web-vitals の useReportWebVitals は effect の dep が [reportWebVitalsFn] であり、
// cleanup も無い。つまり参照が変わるたびに「古いリスナーを残したまま」新しいリスナーが
// 積み増しされる（実運用でのバグの正体）。これを再現するため、直前の呼び出しと参照が
// 異なる場合だけ新規リスナー登録とみなし、蓄積された全リスナーへ発火させる。
function reportMetricToAllAccumulatedListeners(name: string, value: number) {
  let previous: unknown;
  for (const call of useReportWebVitals.mock.calls) {
    const handler = call[0];
    if (handler !== previous) {
      handler?.({ name, value });
      previous = handler;
    }
  }
}

type LayoutShiftEntryInit = { value: number; startTime: number; hadRecentInput: boolean };

class MockPerformanceObserver {
  static instances: MockPerformanceObserver[] = [];
  callback: (list: { getEntries: () => LayoutShiftEntryInit[] }) => void;
  disconnected = false;
  options: unknown;

  constructor(callback: (list: { getEntries: () => LayoutShiftEntryInit[] }) => void) {
    this.callback = callback;
    MockPerformanceObserver.instances.push(this);
  }

  observe(options: unknown) {
    this.options = options;
  }

  disconnect() {
    this.disconnected = true;
  }

  emit(entries: LayoutShiftEntryInit[]) {
    this.callback({ getEntries: () => entries });
  }

  static latest() {
    return MockPerformanceObserver.instances.at(-1);
  }

  static reset() {
    MockPerformanceObserver.instances = [];
  }
}

function fireVisibilityChange(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("WebVitalsReporter", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    MockPerformanceObserver.reset();
    vi.stubGlobal("PerformanceObserver", MockPerformanceObserver);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
    usePathname.mockReturnValue("/events");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("renders nothing", () => {
    const { container } = render(<WebVitalsReporter />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sends an allowed metric via sendBeacon when sampled", () => {
    render(<WebVitalsReporter />);

    reportMetric("LCP", 1200);

    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      "/api/performance/vitals",
      // LCP/INPは既存どおり window.location.pathname を見る（jsdomの既定は "/" = home）。
      JSON.stringify({ page: "home", name: "LCP", value: 1200, device: "desktop" })
    );
  });

  it("ignores a metric name outside LCP/INP/CLS", () => {
    render(<WebVitalsReporter />);

    reportMetric("FCP", 500);

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it("ignores CLS reported via useReportWebVitals (handled by PerformanceObserver instead)", () => {
    render(<WebVitalsReporter />);

    reportMetric("CLS", 0.5);

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it("does not send anything when not sampled", () => {
    // Math.random() は [0, 1) なので、SAMPLE_RATE と同じ値を返せば必ず「対象外」側になる。
    vi.spyOn(Math, "random").mockReturnValue(SAMPLE_RATE);
    render(<WebVitalsReporter />);

    reportMetric("LCP", 1200);

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  describe("CLSのper-route計測", () => {
    it("pathnameが変わったとき、前ページ分のCLSが1回だけ送信される", () => {
      const { rerender } = render(<WebVitalsReporter />);
      const observer = MockPerformanceObserver.latest();
      observer?.emit([{ value: 0.2, startTime: 0, hadRecentInput: false }]);

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);

      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("送信されたpayloadのpageは移動前(events)のページテンプレートである", () => {
      const { rerender } = render(<WebVitalsReporter />);
      const observer = MockPerformanceObserver.latest();
      observer?.emit([{ value: 0.2, startTime: 0, hadRecentInput: false }]);

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);

      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        "/api/performance/vitals",
        JSON.stringify({ page: "events", name: "CLS", value: 0.2, device: "desktop" })
      );
    });

    it("visibilitychangeでhiddenになったときも送信される", () => {
      render(<WebVitalsReporter />);
      const observer = MockPerformanceObserver.latest();
      observer?.emit([{ value: 0.3, startTime: 0, hadRecentInput: false }]);

      fireVisibilityChange("hidden");

      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        "/api/performance/vitals",
        JSON.stringify({ page: "events", name: "CLS", value: 0.3, device: "desktop" })
      );
    });

    it("同じウィンドウで二重送信されない（hidden後にpathname変更のクリーンアップが来ても1回のまま）", () => {
      const { rerender } = render(<WebVitalsReporter />);
      const observer = MockPerformanceObserver.latest();
      observer?.emit([{ value: 0.3, startTime: 0, hadRecentInput: false }]);

      fireVisibilityChange("hidden");
      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);

      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    });

    it("値が0のときは送信しない", () => {
      const { rerender } = render(<WebVitalsReporter />);
      // レイアウトシフトが一切発生しない = emitしない

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);

      expect(navigator.sendBeacon).not.toHaveBeenCalled();
    });

    it("PerformanceObserver非対応環境でも例外を投げない", () => {
      vi.stubGlobal("PerformanceObserver", undefined);

      expect(() => render(<WebVitalsReporter />)).not.toThrow();
      expect(navigator.sendBeacon).not.toHaveBeenCalled();
    });

    it("buffered:trueによる前ページのエントリ再配信を混入させない", () => {
      vi.spyOn(performance, "now").mockReturnValue(1000);

      const { rerender } = render(<WebVitalsReporter />);
      const firstObserver = MockPerformanceObserver.latest();
      firstObserver?.emit([{ value: 0.2, startTime: 0, hadRecentInput: false }]);

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />); // cleanupで "events" 0.2 がflushされ、消費済み時刻が1000に記録される

      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
      vi.mocked(navigator.sendBeacon).mockClear();

      const secondObserver = MockPerformanceObserver.latest();
      // buffered:true により、eventsで既に消費したはずの古いエントリが再配信される
      secondObserver?.emit([{ value: 0.2, startTime: 0, hadRecentInput: false }]);
      // /plans固有の新しいレイアウトシフト
      secondObserver?.emit([{ value: 0.15, startTime: 1200, hadRecentInput: false }]);

      fireVisibilityChange("hidden");

      // 混入していれば 0.2 (またはそれを含む合算値) が送られてしまう。
      // 正しくは /plans 固有分の 0.15 だけが送られるべき。
      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        "/api/performance/vitals",
        JSON.stringify({ page: "plans", name: "CLS", value: 0.15, device: "desktop" })
      );
    });

    it("初回ロードでは消費済み時刻がまだ無いため、startTimeが小さいbufferedエントリも計測対象になる", () => {
      render(<WebVitalsReporter />);
      const observer = MockPerformanceObserver.latest();
      // ハイドレーション前に発生した、buffered:true本来の対象となるエントリを想定
      observer?.emit([{ value: 0.05, startTime: 0, hadRecentInput: false }]);

      fireVisibilityChange("hidden");

      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        "/api/performance/vitals",
        JSON.stringify({ page: "events", name: "CLS", value: 0.05, device: "desktop" })
      );
    });
  });

  describe("useReportWebVitalsへ渡すコールバックの参照安定性", () => {
    it("pathnameが変わって再レンダリングされても、渡す関数の参照は同一である", () => {
      const { rerender } = render(<WebVitalsReporter />);
      const firstCallback = useReportWebVitals.mock.calls.at(-1)?.[0];

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);
      const secondCallback = useReportWebVitals.mock.calls.at(-1)?.[0];

      usePathname.mockReturnValue("/settings");
      rerender(<WebVitalsReporter />);
      const thirdCallback = useReportWebVitals.mock.calls.at(-1)?.[0];

      expect(secondCallback).toBe(firstCallback);
      expect(thirdCallback).toBe(firstCallback);
    });

    it("複数回の遷移のあとLCPを1回発火させても、送信は1回だけである", () => {
      const { rerender } = render(<WebVitalsReporter />);

      usePathname.mockReturnValue("/plans");
      rerender(<WebVitalsReporter />);
      usePathname.mockReturnValue("/settings");
      rerender(<WebVitalsReporter />);
      usePathname.mockReturnValue("/events");
      rerender(<WebVitalsReporter />);

      reportMetricToAllAccumulatedListeners("LCP", 1200);

      expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    });
  });
});
