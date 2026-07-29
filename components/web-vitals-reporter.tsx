"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

import { maxSessionWindowValue, type LayoutShiftSample } from "@/lib/domain/cls";
import { isAllowedWebVitalName, mapPathnameToPageTemplate, type WebVitalInput } from "@/lib/domain/web-vitals";

// 通常運用は5%サンプリング。原因調査時のみ一時的に1へ引き上げる。
export const SAMPLE_RATE = 0.05;

// layout-shift エントリは lib.dom.d.ts にまだ型定義がないため、必要なプロパティだけ持つ形で扱う。
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

function reasonableMetricValue(name: WebVitalInput["name"], value: number) {
  if (!Number.isFinite(value) || value < 0) return false;
  return name === "CLS" ? value <= 10 : value <= 120_000;
}

function currentDevice(): WebVitalInput["device"] {
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

function send(payload: WebVitalInput) {
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
}

export function WebVitalsReporter() {
  const [sampled] = useState(() => Math.random() < SAMPLE_RATE);
  const pathname = usePathname();
  // 「どの時刻より前のlayout-shiftエントリを前ページ分として捨てるか」の下限。
  // buffered:trueは soft navigation でクリアされず、前ページのエントリを
  // 新しいObserverに再配信してくるため、消費済みの時刻で線引きする。
  const consumedUntilRef = useRef(0);

  // useReportWebVitals（next/web-vitals）は内部の useEffect の依存配列に
  // このコールバック自身を入れており、cleanup も無い。参照が毎回変わると
  // 古いリスナーを残したまま新しいリスナーが積み増しされ、多重送信につながる。
  // useCallback で参照を安定させ、依存は sampled のみにする（pathname を入れない）。
  const reportWebVitals = useCallback(
    (metric: { name: string; value: number }) => {
      if (!sampled || !isAllowedWebVitalName(metric.name)) return;
      // CLS はページ単位のセッションウィンドウ集計が必要なため、ここでは扱わず
      // 下の PerformanceObserver ベースの計測に任せる。
      if (metric.name === "CLS") return;
      if (!reasonableMetricValue(metric.name, metric.value)) return;

      send({
        page: mapPathnameToPageTemplate(window.location.pathname),
        name: metric.name,
        value: metric.value,
        device: currentDevice()
      });
    },
    [sampled]
  );

  useReportWebVitals(reportWebVitals);

  // CLS はドキュメント全体で累積するのではなく、ページ（pathname）ごとに
  // 計測ウィンドウを区切って集計する。こうしないと「どのページでズレたか」が分からない。
  useEffect(() => {
    if (!sampled) return;
    if (typeof PerformanceObserver === "undefined") return;

    // このウィンドウを開始した時点の pathname を固定で持つ。
    // 送信時の pathname ではなく、計測を始めたページを報告する。
    const page = mapPathnameToPageTemplate(pathname ?? window.location.pathname);
    // このウィンドウが「自分のもの」とみなすエントリのstartTime下限。
    // 初回ロード時は0なので、ハイドレーション前のシフト(buffered:trueの本来の目的)は
    // これまで通り拾う。2ページ目以降は前ページのflush時刻が入るため、前ページ由来の
    // 再配信エントリを除外できる。
    const since = consumedUntilRef.current;
    const samples: LayoutShiftSample[] = [];
    let flushed = false;

    const flush = () => {
      if (flushed) return;
      const value = maxSessionWindowValue(samples);
      if (value <= 0) return;
      if (!reasonableMetricValue("CLS", value)) return;
      flushed = true;
      send({ page, name: "CLS", value, device: currentDevice() });
    };

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          // sinceより前のstartTimeは前ページ由来の再配信エントリなので捨てる。
          if (entry.startTime < since) continue;
          samples.push({
            value: entry.value,
            startTime: entry.startTime,
            hadRecentInput: entry.hadRecentInput
          });
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch {
      // layout-shift 非対応環境（Safari / Firefox / jsdom 等）。何もしない。
      observer = null;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // pathname が変わる（＝このページから離脱する）タイミングで必ずflushする。
      flush();
      observer?.disconnect();
      // 次のページのウィンドウが、このページ由来のbufferedエントリを除外できるようにする。
      consumedUntilRef.current = performance.now();
    };
  }, [pathname, sampled]);

  return null;
}
