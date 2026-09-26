"use client";

import React from "react";
import { clsx } from "clsx";

import {
  connectionGroupColorLabels,
  connectionGroupColors,
  connectionGroupDotClass,
  type ConnectionGroupColor
} from "@/lib/domain/account/connection-groups";

export function ConnectionGroupColorField({
  name,
  value,
  onChange
}: {
  name: string;
  value: ConnectionGroupColor;
  onChange: (color: ConnectionGroupColor) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-body font-bold text-ink">色</legend>
      <div className="flex flex-wrap gap-2">
        {connectionGroupColors.map((color) => (
          <label
            key={color}
            className={clsx(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-clay focus-within:ring-offset-2",
              value === color ? "border-pine bg-mist text-pine" : "border-line-strong bg-surface text-ink hover:border-moss"
            )}
          >
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="sr-only"
            />
            <span aria-hidden="true" className={clsx("h-3 w-3 rounded-full", connectionGroupDotClass[color])} />
            {connectionGroupColorLabels[color]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
