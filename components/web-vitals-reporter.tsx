"use client";

import { useState } from "react";
import { useReportWebVitals } from "next/web-vitals";

import {
  isAllowedWebVitalName,
  mapPathnameToPageTemplate,
  type WebVitalInput
} from "@/lib/domain/web-vitals";

export { mapPathnameToPageTemplate } from "@/lib/domain/web-vitals";

const SAMPLE_RATE = 0.05;

function reasonableMetricValue(name: WebVitalInput["name"], value: number) {
  if (!Number.isFinite(value) || value < 0) return false;
  return name === "CLS" ? value <= 10 : value <= 120_000;
}

export function WebVitalsReporter() {
  const [sampled] = useState(() => Math.random() < SAMPLE_RATE);

  useReportWebVitals((metric) => {
    if (!sampled || !isAllowedWebVitalName(metric.name)) return;
    if (!reasonableMetricValue(metric.name, metric.value)) return;

    const payload: WebVitalInput = {
      page: mapPathnameToPageTemplate(window.location.pathname),
      name: metric.name,
      value: metric.value,
      device: window.matchMedia("(max-width: 767px)").matches
        ? "mobile"
        : "desktop"
    };
    const body = JSON.stringify(payload);

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/performance/vitals", body);
      return;
    }

    void fetch("/api/performance/vitals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    });
  });

  return null;
}
