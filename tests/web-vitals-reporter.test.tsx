import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useReportWebVitals } = vi.hoisted(() => ({ useReportWebVitals: vi.fn() }));

vi.mock("next/web-vitals", () => ({ useReportWebVitals }));

import { SAMPLE_RATE, WebVitalsReporter } from "@/components/web-vitals-reporter";

function reportMetric(name: string, value: number) {
  const handler = useReportWebVitals.mock.calls.at(-1)?.[0];
  handler?.({ name, value });
}

describe("WebVitalsReporter", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.stubGlobal("navigator", { sendBeacon: vi.fn() });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });
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
      JSON.stringify({ page: "home", name: "LCP", value: 1200, device: "desktop" })
    );
  });

  it("ignores a metric name outside LCP/INP/CLS", () => {
    render(<WebVitalsReporter />);

    reportMetric("FCP", 500);

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it("does not send anything when not sampled", () => {
    // Math.random() は [0, 1) なので、SAMPLE_RATE と同じ値を返せば必ず「対象外」側になる。
    vi.spyOn(Math, "random").mockReturnValue(SAMPLE_RATE);
    render(<WebVitalsReporter />);

    reportMetric("LCP", 1200);

    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});
