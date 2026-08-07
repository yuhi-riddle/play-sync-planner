"use client";

import { Check, ChevronDown } from "lucide-react";
import React, { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormEvent, InvalidEvent, KeyboardEvent, ReactNode } from "react";
import { clsx } from "clsx";

import { Alert } from "@/components/ui-server";

/**
 * 操作を伴うプリミティブ（hooks・イベントハンドラを使う）。
 * 表示だけのプリミティブは `./ui-server` にある。両方とも `./ui` から再エクスポートしている。
 */

type MadoiFormError = {
  key: string;
  message: string;
};

type MadoiFormProps = Omit<React.ComponentPropsWithoutRef<"form">, "onSubmit" | "noValidate"> & {
  /** Server Actionが返したエラー文言。クライアント側の入力検証と同じAlertに表示する。 */
  serverError?: string;
};

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

export function MadoiForm({ children, className, action, serverError, ...props }: MadoiFormProps) {
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
      ) : serverError ? (
        <Alert tone="error" assertive>
          {serverError}
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
  requiredMessage,
  onValueChange
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
  /**
   * 入力中の値を親に知らせる。渡さなければ従来どおり非制御のまま。
   * 値は input が持ち続けるので、親が state を返す必要はない
   * （経費フォームが「1人あたりいくら」を出すために金額の変化だけを見ている）。
   */
  onValueChange?: (value: string) => void;
}) {
  function handleInvalid(event: InvalidEvent<HTMLInputElement>) {
    if (requiredMessage && event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity(requiredMessage);
    }
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
    onValueChange?.(event.currentTarget.value);
  }

  return (
    <label className="block text-body font-medium text-ink">
      <span className="text-muted">{label}</span>
      <input
        className="mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/20"
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
          "flex w-full items-center justify-between gap-3 rounded-control border border-line-strong bg-surface text-left text-base text-ink transition-colors hover:border-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/20",
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
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay",
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
        className="mt-2 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/20"
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

const submitButtonVariantClasses = {
  primary:
    "bg-ink text-white shadow-soft hover:bg-pine",
  secondary:
    "border border-line-strong bg-surface text-ink hover:border-moss hover:text-pine"
} as const;

/**
 * `useFormStatus` で送信中を検知し、連打による二重送信を防ぐ。
 * MadoiForm など `<form action={...}>` の内側に置いて使う。
 */
export const SubmitButton = React.forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    /** 送信中に表示する文言。省略時は元のラベルのまま。 */
    pendingChildren?: ReactNode;
    variant?: keyof typeof submitButtonVariantClasses;
    icon?: ReactNode;
    /** 幅などのレイアウト調整用。色・状態のクラスは上書きしない。 */
    className?: string;
  }
>(function SubmitButton({ children, pendingChildren, variant = "primary", icon, className }, ref) {
  const { pending } = useFormStatus();

  return (
    <button
      ref={ref}
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={clsx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-2 text-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        submitButtonVariantClasses[variant],
        className
      )}
    >
      {!pending && icon}
      {pending && pendingChildren ? pendingChildren : children}
    </button>
  );
});
