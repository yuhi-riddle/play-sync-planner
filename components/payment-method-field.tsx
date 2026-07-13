"use client";

import React, { useState } from "react";
import { clsx } from "clsx";

const defaultPaymentMethodOptions = ["PayPay", "銀行振込", "現金"];

export function PaymentMethodField({
  name = "payment_method",
  label = "支払い方法",
  defaultValue,
  placeholder = "例: PayPay、銀行振込、現金",
  options = defaultPaymentMethodOptions,
  compact = false
}: {
  name?: string;
  label?: string;
  defaultValue?: string | null;
  placeholder?: string;
  options?: string[];
  compact?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <label className="block text-sm font-medium text-ink">
      <span className="text-muted">{label}</span>
      <input
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={clsx(
          "mt-2 w-full rounded-control border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20",
          compact ? "min-h-10" : "min-h-11"
        )}
        placeholder={placeholder}
      />
      <span className="mt-2 flex flex-wrap gap-2" aria-label={`${label}の候補`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setValue(option)}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
              value === option
                ? "border-moss bg-mist/45 text-pine"
                : "border-line bg-surface text-muted hover:border-moss hover:text-pine"
            )}
          >
            {option}
          </button>
        ))}
      </span>
    </label>
  );
}
