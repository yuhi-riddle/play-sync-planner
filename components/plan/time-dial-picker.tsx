"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Clock } from "lucide-react";

import {
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  buildHourDialPositions,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
  pointForAngleDeg,
  TIME_DIAL_INNER_RADIUS,
  TIME_DIAL_OUTER_RADIUS,
  TIME_DIAL_STEP_MINUTES,
  type TimeDialMode
} from "@/lib/domain/plan/time-dial";

const DIAL_VIEWBOX_SIZE = 180;
const DEFAULT_MINUTES_WHEN_ENABLING = 20 * 60;

function chipClassName(active: boolean) {
  return active
    ? "inline-flex min-h-11 items-center gap-2 rounded-full border border-pine-deep bg-gradient-to-br from-pine to-pine-deep px-4 text-sm font-bold text-white"
    : "inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-bold text-pine transition-colors hover:border-moss";
}

function segmentClassName(active: boolean) {
  return active
    ? "min-h-9 min-w-11 rounded-control bg-pine px-2 text-lg font-black text-white"
    : "min-h-9 min-w-11 rounded-control bg-transparent px-2 text-lg font-black text-pine";
}

export function TimeDialPicker({
  time,
  onTimeChange,
  label,
  fieldLabel,
  buttonRef,
  optional = false,
  onClear
}: {
  time: string;
  onTimeChange: (value: string) => void;
  label: string;
  fieldLabel: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  optional?: boolean;
  onClear?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TimeDialMode>("hour");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const minutesRef = useRef(0);

  const isUnset = optional && time === "";
  const minutes = isUnset ? 0 : parseTimeToMinutes(time);
  minutesRef.current = minutes;

  const localPointFromEvent = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) {
      return null;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scale = DIAL_VIEWBOX_SIZE / rect.width;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }, []);

  const applyPoint = useCallback(
    (localX: number, localY: number) => {
      const angleDeg = clientPointToAngleDeg(localX, localY);
      const radius = Math.hypot(localX - 90, localY - 90);
      const nextMinutes = angleToMinutes(angleDeg, radius, mode, minutesRef.current);
      onTimeChange(formatMinutesToTime(nextMinutes));
    },
    [mode, onTimeChange]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const point = localPointFromEvent(event.clientX, event.clientY);
      if (!point) {
        return;
      }
      applyPoint(point.x, point.y);
    },
    [applyPoint, localPointFromEvent]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [expanded, handlePointerMove, handlePointerUp]);

  if (isUnset) {
    return (
      <button
        type="button"
        onClick={() => {
          onTimeChange(formatMinutesToTime(DEFAULT_MINUTES_WHEN_ENABLING));
          setExpanded(true);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface px-4 text-sm font-bold text-muted"
      >
        + {label}を設定
      </button>
    );
  }

  const { h, m } = { h: String(Math.floor(minutes / 60)).padStart(2, "0"), m: String(minutes % 60).padStart(2, "0") };
  const hour = Number(h);
  const hand = handPointForMinutes(minutes, mode);
  const ticks = buildDialTicks(mode);
  const tickLabels = buildDialTickLabels(mode);
  const hourPositions = buildHourDialPositions();

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className={chipClassName(expanded)}
      >
        <Clock aria-hidden="true" className="h-4 w-4" />
        {label} {h}:{m}
      </button>

      {expanded ? (
        <div className="flex flex-col items-center gap-2 rounded-control border border-line bg-surface p-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={mode === "hour"}
              onClick={() => setMode("hour")}
              className={segmentClassName(mode === "hour")}
            >
              {h}
            </button>
            <span className="text-lg font-black text-ink">:</span>
            <button
              type="button"
              aria-pressed={mode === "minute"}
              onClick={() => setMode("minute")}
              className={segmentClassName(mode === "minute")}
            >
              {m}
            </button>
          </div>

          <svg
            ref={svgRef}
            data-testid="time-dial-svg"
            viewBox={`0 0 ${DIAL_VIEWBOX_SIZE} ${DIAL_VIEWBOX_SIZE}`}
            width={160}
            height={160}
            style={{ touchAction: "none" }}
          >
            <circle
              data-testid="time-dial-ring"
              cx="90"
              cy="90"
              r="72"
              fill="transparent"
              className="stroke-line"
              strokeWidth={2}
              style={{ cursor: "pointer" }}
              onPointerDown={(event) => {
                const point = localPointFromEvent(event.clientX, event.clientY);
                if (!point) {
                  return;
                }
                applyPoint(point.x, point.y);
                draggingRef.current = true;
              }}
            />
            {/*
              数字・強調円・針は見た目の装飾で、実際のタップ判定はこの下のリング(円)が担う。
              pointer-events-none を付けないと、数字ちょうどをタップした時にその<text>要素が
              クリックを奪ってしまい、リングの onPointerDown まで届かない(実機でのみ再現し、
              フォーカス位置を指定できないため座標ベースのテストでは検出しづらい不具合だった)。
            */}
            {mode === "minute" ? (
              <>
                {ticks.map((tick, index) => (
                  <line
                    key={index}
                    x1={tick.x1}
                    y1={tick.y1}
                    x2={tick.x2}
                    y2={tick.y2}
                    className="stroke-line-strong pointer-events-none"
                    strokeWidth={1.5}
                  />
                ))}
                {tickLabels.map((tickLabel) => (
                  <text
                    key={tickLabel.label}
                    x={tickLabel.x}
                    y={tickLabel.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    fontWeight={700}
                    className={tickLabel.label === m ? "fill-white transition-all pointer-events-none" : "fill-muted transition-all pointer-events-none"}
                  >
                    {tickLabel.label}
                  </text>
                ))}
                {tickLabels
                  .filter((tickLabel) => tickLabel.label === m)
                  .map((tickLabel) => (
                    <circle
                      key="selected-minute-bg"
                      cx={tickLabel.x}
                      cy={tickLabel.y}
                      r={12}
                      className="fill-pine transition-all pointer-events-none"
                    />
                  ))}
              </>
            ) : (
              hourPositions.map((position) => {
                const outerSelected = hour === position.outerValue;
                const innerSelected = hour === position.innerValue;
                const showInner = position.innerAlwaysVisible || innerSelected;
                const outerPoint = pointForAngleDeg(position.angleDeg, TIME_DIAL_OUTER_RADIUS);
                const innerPoint = pointForAngleDeg(position.angleDeg, TIME_DIAL_INNER_RADIUS);
                return (
                  <React.Fragment key={position.angleDeg}>
                    {outerSelected ? (
                      <circle cx={outerPoint.x} cy={outerPoint.y} r={13} className="fill-pine transition-all pointer-events-none" />
                    ) : null}
                    <text
                      x={outerPoint.x}
                      y={outerPoint.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={14}
                      fontWeight={700}
                      className={outerSelected ? "fill-white transition-all pointer-events-none" : "fill-ink transition-all pointer-events-none"}
                    >
                      {position.outerValue}
                    </text>
                    {showInner ? (
                      <>
                        {innerSelected ? (
                          <circle cx={innerPoint.x} cy={innerPoint.y} r={11} className="fill-pine transition-all pointer-events-none" />
                        ) : null}
                        <text
                          x={innerPoint.x}
                          y={innerPoint.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={10}
                          fontWeight={500}
                          className={innerSelected ? "fill-white transition-all pointer-events-none" : "fill-subtle transition-all pointer-events-none"}
                        >
                          {String(position.innerValue).padStart(2, "0")}
                        </text>
                      </>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
            <line
              x1={90}
              y1={90}
              x2={hand.x}
              y2={hand.y}
              className="stroke-pine transition-all pointer-events-none"
              strokeWidth={4}
              strokeLinecap="round"
            />
            <circle cx={90} cy={90} r={4} className="fill-pine pointer-events-none" />
            <circle
              role="slider"
              aria-label={`${fieldLabel}のつまみ`}
              aria-valuemin={mode === "hour" ? 0 : 0}
              aria-valuemax={mode === "hour" ? 23 : 55}
              aria-valuenow={mode === "hour" ? Number(h) : Number(m)}
              aria-valuetext={`${h}:${m}`}
              tabIndex={0}
              cx={hand.x}
              cy={hand.y}
              r={6}
              className={mode === "hour" ? "fill-none stroke-none transition-all" : "fill-surface stroke-pine transition-all"}
              strokeWidth={3}
              pointerEvents="all"
              style={{ cursor: "grab" }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                draggingRef.current = true;
              }}
              onKeyDown={(event) => {
                const step = mode === "hour" ? 60 : TIME_DIAL_STEP_MINUTES;
                if (event.key === "ArrowUp" || event.key === "ArrowRight") {
                  event.preventDefault();
                  onTimeChange(formatMinutesToTime((minutesRef.current + step + 24 * 60) % (24 * 60)));
                } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  onTimeChange(formatMinutesToTime((minutesRef.current - step + 24 * 60) % (24 * 60)));
                }
              }}
            />
          </svg>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="min-h-9 rounded-full bg-pine px-5 text-sm font-bold text-white"
            >
              完了
            </button>
            {optional ? (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onClear?.();
                }}
                className="min-h-9 rounded-full border border-line-strong px-4 text-sm font-bold text-muted"
              >
                未設定に戻す
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
