"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Clock } from "lucide-react";

import {
  angleToMinutes,
  buildDialTickLabels,
  buildDialTicks,
  clientPointToAngleDeg,
  formatMinutesToTime,
  handPointForMinutes,
  parseTimeToMinutes,
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
    : "min-h-9 min-w-11 rounded-control bg-transparent px-2 text-lg font-black text-moss";
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

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current || !svgRef.current) {
        return;
      }
      const rect = svgRef.current.getBoundingClientRect();
      const scale = DIAL_VIEWBOX_SIZE / rect.width;
      const localX = (event.clientX - rect.left) * scale;
      const localY = (event.clientY - rect.top) * scale;
      const angleDeg = clientPointToAngleDeg(localX, localY);
      const nextMinutes = angleToMinutes(angleDeg, mode, minutesRef.current);
      onTimeChange(formatMinutesToTime(nextMinutes));
    },
    [mode, onTimeChange]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  if (isUnset) {
    return (
      <button
        type="button"
        onClick={() => {
          onTimeChange(formatMinutesToTime(DEFAULT_MINUTES_WHEN_ENABLING));
          setExpanded(true);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface px-4 text-sm font-bold text-subtle"
      >
        + {label}を設定
      </button>
    );
  }

  const { h, m } = { h: String(Math.floor(minutes / 60)).padStart(2, "0"), m: String(minutes % 60).padStart(2, "0") };
  const hand = handPointForMinutes(minutes, mode);
  const ticks = buildDialTicks(mode);
  const tickLabels = buildDialTickLabels(mode);

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
            <circle cx="90" cy="90" r="72" fill="none" stroke="var(--madoi-line)" strokeWidth={2} />
            {ticks.map((tick, index) => (
              <line key={index} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="var(--madoi-line-strong)" strokeWidth={1.5} />
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
                fill="var(--madoi-muted)"
              >
                {tickLabel.label}
              </text>
            ))}
            <line x1={90} y1={90} x2={hand.x} y2={hand.y} stroke="var(--madoi-pine)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={90} cy={90} r={4} fill="var(--madoi-pine)" />
            <circle
              role="button"
              aria-label={`${label}のつまみ`}
              tabIndex={0}
              cx={hand.x}
              cy={hand.y}
              r={15}
              fill="var(--madoi-surface)"
              stroke="var(--madoi-pine)"
              strokeWidth={5}
              style={{ cursor: "grab" }}
              onPointerDown={(event) => {
                event.preventDefault();
                draggingRef.current = true;
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
