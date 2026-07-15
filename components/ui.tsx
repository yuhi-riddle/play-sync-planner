"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import React, { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, InvalidEvent, KeyboardEvent, ReactNode } from "react";
import { clsx } from "clsx";

import { brand } from "@/lib/brand";

export function PageHeader({
  title,
  description,
  eyebrow,
  action
}: {
  title: string;
  description?: string;
  /** 画面のカテゴリ。省略するとブランド名になるが、原則として画面ごとの語を渡す */
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-eyebrow uppercase text-pine">{eyebrow ?? brand.shortName}</p>
        <h1 className="mt-2 break-words text-display text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-body text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.ComponentPropsWithoutRef<"section">) {
  return (
    <section className={clsx("rounded-card border border-line bg-surface p-5 shadow-raise", className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  description,
  icon,
  action
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-title text-ink">
          {icon}
          {title}
        </h2>
        {description ? <p className="mt-1 text-caption text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
    </Link>
  );
}

type MadoiFormError = {
  key: string;
  message: string;
};

type MadoiFormProps = Omit<React.ComponentPropsWithoutRef<"form">, "onSubmit" | "noValidate">;

function isFormField(element: Element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

function getFieldLabel(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  return field.dataset.fieldLabel || field.getAttribute("aria-label") || field.name || "入力項目";
}

function getValidationMessage(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const label = getFieldLabel(field);

  if (field.validity.valueMissing) {
    return field.dataset.requiredMessage || `${label}を入力してください。`;
  }

  if (field.validity.typeMismatch) {
    return field.dataset.invalidMessage || `${label}の形式を確認してください。`;
  }

  if (field.validity.rangeUnderflow) {
    return `${label}は${field.getAttribute("min")}以上で入力してください。`;
  }

  if (field.validity.rangeOverflow) {
    return `${label}は${field.getAttribute("max")}以下で入力してください。`;
  }

  if (field.validity.stepMismatch) {
    return `${label}は指定された単位で入力してください。`;
  }

  return field.dataset.invalidMessage || `${label}を確認してください。`;
}

function collectValidationErrors(form: HTMLFormElement) {
  const handledRadioGroups = new Set<string>();

  return Array.from(form.elements)
    .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
      if (!isFormField(element) || !element.willValidate || element.checkValidity()) {
        return false;
      }

      if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
        if (handledRadioGroups.has(element.name)) {
          return false;
        }
        handledRadioGroups.add(element.name);
      }

      return true;
    })
    .map((field, index) => ({
      key: field.name || field.id || String(index),
      message: getValidationMessage(field)
    }));
}

function focusFirstInvalidField(form: HTMLFormElement) {
  const firstInvalidField = Array.from(form.elements).find((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
    return isFormField(element) && element.willValidate && !element.checkValidity();
  });

  if (!firstInvalidField) {
    return;
  }

  const customFocusId = firstInvalidField.dataset.madoiFocusId;
  const customTarget = customFocusId ? document.getElementById(customFocusId) : null;
  if (customTarget) {
    customTarget.scrollIntoView({ block: "center", behavior: "smooth" });
    customTarget.focus({ preventScroll: true });
    return;
  }

  firstInvalidField.scrollIntoView({ block: "center", behavior: "smooth" });
  firstInvalidField.focus({ preventScroll: true });
}

export function MadoiForm({ children, className, action, ...props }: MadoiFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<MadoiFormError[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const nextErrors = collectValidationErrors(form);

    if (nextErrors.length === 0) {
      setErrors([]);
      return;
    }

    event.preventDefault();
    setErrors(nextErrors);
    focusFirstInvalidField(form);
  }

  return (
    <form ref={formRef} action={action} className={className} noValidate onSubmit={handleSubmit} {...props}>
      {errors.length > 0 ? (
        <Alert tone="error" title="入力を確認してください。" assertive>
          <ul className="grid gap-1">
            {errors.map((error) => (
              <li key={error.key}>{error.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {children}
    </form>
  );
}

export function TextField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  helpText,
  step,
  min,
  requiredMessage
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  step?: number;
  min?: number;
  requiredMessage?: string;
}) {
  function handleInvalid(event: InvalidEvent<HTMLInputElement>) {
    if (requiredMessage && event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity(requiredMessage);
    }
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
  }

  return (
    <label className="block text-body font-medium text-ink">
      <span className="text-muted">{label}</span>
      <input
        className="mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        onInvalid={handleInvalid}
        onInput={handleInput}
        data-field-label={label}
        data-required-message={requiredMessage}
        data-invalid-message={type === "url" ? "URLの形式を確認してください。" : undefined}
      />
      {helpText ? <span className="mt-2 block text-caption text-muted">{helpText}</span> : null}
    </label>
  );
}

type SelectOption = { value: string; label: string; disabled?: boolean };

export function MadoiSelect({
  name,
  value,
  defaultValue,
  options,
  onValueChange,
  required,
  requiredMessage,
  fieldLabel,
  ariaLabel,
  compact = false,
  buttonRef
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  onValueChange?: (value: string) => void;
  required?: boolean;
  requiredMessage?: string;
  fieldLabel: string;
  ariaLabel?: string;
  compact?: boolean;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const generatedId = useId();
  const buttonId = `madoi-select-${generatedId}`;
  const listboxId = `madoi-select-list-${generatedId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selectedValue = value ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const activeOptions = options.filter((option) => !option.disabled);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectValue(nextValue: string) {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
    setOpen(false);
  }

  function moveSelection(amount: number) {
    if (activeOptions.length === 0) {
      return;
    }

    const currentIndex = Math.max(0, activeOptions.findIndex((option) => option.value === selectedValue));
    const nextIndex = (currentIndex + amount + activeOptions.length) % activeOptions.length;
    selectValue(activeOptions[nextIndex].value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveSelection(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      moveSelection(-1);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {name ? (
        <input
          className="pointer-events-none absolute left-3 top-3 h-px w-px opacity-0"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={selectedValue}
          readOnly
          required={required}
          data-field-label={fieldLabel}
          data-required-message={requiredMessage}
          data-madoi-focus-id={buttonId}
        />
      ) : null}
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-label={ariaLabel ?? fieldLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        className={clsx(
          "flex w-full items-center justify-between gap-3 rounded-control border border-line-strong bg-surface text-left text-base text-ink transition-colors hover:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20",
          compact ? "min-h-11 px-3 py-2" : "min-h-11 px-3 py-2"
        )}
      >
        <span className={selectedOption ? "font-medium" : "text-muted"}>{selectedOption?.label ?? "選択してください"}</span>
        <ChevronDown aria-hidden="true" className={clsx("h-4 w-4 shrink-0 text-moss transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-2 max-h-64 w-full overflow-y-auto rounded-control border border-line bg-surface p-2 shadow-lift"
        >
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => selectValue(option.value)}
                className={clsx(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay",
                  selected ? "bg-mist text-pine" : "text-ink hover:bg-sunken",
                  option.disabled && "pointer-events-none text-subtle"
                )}
              >
                <span>{option.label}</span>
                {selected ? <Check aria-hidden="true" className="h-4 w-4 text-moss" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  rows = 4,
  required,
  placeholder,
  helpText,
  requiredMessage
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  requiredMessage?: string;
}) {
  function handleInvalid(event: InvalidEvent<HTMLTextAreaElement>) {
    if (requiredMessage && event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity(requiredMessage);
    }
  }

  function handleInput(event: FormEvent<HTMLTextAreaElement>) {
    event.currentTarget.setCustomValidity("");
  }

  return (
    <label className="block text-body font-medium text-ink">
      <span className="text-muted">{label}</span>
      <textarea
        className="mt-2 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-moss focus:ring-2 focus:ring-moss/20"
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        required={required}
        placeholder={placeholder}
        onInvalid={handleInvalid}
        onInput={handleInput}
        data-field-label={label}
        data-required-message={requiredMessage}
      />
      {helpText ? <span className="mt-2 block text-caption text-muted">{helpText}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
  requiredMessage
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  required?: boolean;
  requiredMessage?: string;
}) {
  return (
    <label className="block text-body font-medium text-ink">
      <span className="text-muted">{label}</span>
      <div className="mt-2">
        <MadoiSelect
          name={name}
          defaultValue={defaultValue}
          options={options}
          required={required}
          requiredMessage={requiredMessage}
          fieldLabel={label}
        />
      </div>
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
    </button>
  );
}

/**
 * 空状態。破線で囲うと「作りかけ」に見えるので、一段沈んだ面で表現する。
 */
export function EmptyState({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-sunken p-5 text-body text-muted">
      {icon ? (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-mist text-moss">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 状態・数値・通知
 * ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "info" | "warn" | "accent" | "done";

const badgeToneClasses: Record<BadgeTone, string> = {
  neutral: "border-line bg-sunken text-muted",
  info: "border-honey/45 bg-honey/18 text-honey-ink", // 調整中
  warn: "border-clay/40 bg-clay/14 text-clay-ink", // 期限・要対応
  accent: "border-moss/30 bg-skywash text-pine",
  done: "border-moss/30 bg-mist text-pine" // 確定・完了
};

const badgeDotClasses: Record<BadgeTone, string> = {
  neutral: "bg-subtle",
  info: "bg-honey-ink",
  warn: "bg-clay-ink",
  accent: "bg-moss",
  done: "bg-moss"
};

/** 色だけで状態を伝えないよう、ラベルは必須にしている。 */
export function Badge({ children, tone = "neutral", dot = false }: { children: ReactNode; tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-caption font-bold",
        badgeToneClasses[tone]
      )}
    >
      {dot ? <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", badgeDotClasses[tone])} /> : null}
      {children}
    </span>
  );
}

/**
 * 数値。emphasis="primary" は1画面に1つまで。
 * 複数を primary にすると、どれも主役でなくなる。
 */
export function Stat({
  label,
  value,
  sub,
  emphasis = "secondary",
  tone
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  emphasis?: "primary" | "secondary";
  tone?: "warn" | "muted";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption font-bold text-muted">{label}</span>
      <span
        className={clsx(
          "tabular-nums",
          emphasis === "primary" ? "text-[2.5rem] font-bold leading-none tracking-tight" : "text-stat",
          tone === "warn" && "text-clay-ink",
          tone === "muted" && "text-muted"
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-caption text-muted">{sub}</span> : null}
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const safeMax = Math.max(max, 1);
  const percent = Math.min(100, Math.max(0, Math.round((value / safeMax) * 100)));

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? "進捗"}
      className="h-2 overflow-hidden rounded-full border border-line bg-sunken"
    >
      <span className="block h-full rounded-full bg-gradient-to-r from-moss to-pine transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

const alertToneClasses = {
  info: "border-moss/28 bg-mist text-ink",
  warn: "border-honey/45 bg-honey/14 text-ink",
  error: "border-clay/40 bg-clay/12 text-ink"
} as const;

export function Alert({
  children,
  title,
  tone = "info",
  assertive = false
}: {
  children?: ReactNode;
  title?: string;
  tone?: keyof typeof alertToneClasses;
  assertive?: boolean;
}) {
  return (
    <div
      role="alert"
      aria-live={assertive ? "assertive" : "polite"}
      className={clsx("rounded-control border p-4 text-body", alertToneClasses[tone])}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={clsx(title && "mt-2")}>{children}</div> : null}
    </div>
  );
}
