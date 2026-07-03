"use client";

import Link from "next/link";
import React, { useRef, useState } from "react";
import type { FormEvent, InvalidEvent, ReactNode } from "react";
import { clsx } from "clsx";

import { brand } from "@/lib/brand";

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-lg border border-white/70 bg-cream/72 p-5 shadow-soft backdrop-blur sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss">{brand.shortName}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/68">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-lg border border-white/80 bg-cream/88 p-5 shadow-soft backdrop-blur", className)}>
      {children}
    </section>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
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
        <div
          className="rounded-lg border border-clay/24 bg-clay/10 p-4 text-sm text-ink"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-bold">入力を確認してください。</p>
          <ul className="mt-2 grid gap-1 leading-6">
            {errors.map((error) => (
              <li key={error.key}>{error.message}</li>
            ))}
          </ul>
        </div>
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
  list,
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
  list?: string;
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
    <label className="block text-sm font-medium text-ink">
      <span className="text-ink/72">{label}</span>
      <input
        className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        step={step}
        min={min}
        list={list}
        onInvalid={handleInvalid}
        onInput={handleInput}
        data-field-label={label}
        data-required-message={requiredMessage}
        data-invalid-message={type === "url" ? "URLの形式を確認してください。" : undefined}
      />
      {helpText ? <span className="mt-2 block text-xs leading-5 text-ink/55">{helpText}</span> : null}
    </label>
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
    <label className="block text-sm font-medium text-ink">
      <span className="text-ink/72">{label}</span>
      <textarea
        className="mt-2 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
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
      {helpText ? <span className="mt-2 block text-xs leading-5 text-ink/55">{helpText}</span> : null}
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
  function handleInvalid(event: InvalidEvent<HTMLSelectElement>) {
    if (requiredMessage && event.currentTarget.validity.valueMissing) {
      event.currentTarget.setCustomValidity(requiredMessage);
    }
  }

  function handleInput(event: FormEvent<HTMLSelectElement>) {
    event.currentTarget.setCustomValidity("");
  }

  return (
    <label className="block text-sm font-medium text-ink">
      <span className="text-ink/72">{label}</span>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        name={name}
        defaultValue={defaultValue}
        required={required}
        onInvalid={handleInvalid}
        onInput={handleInput}
        data-field-label={label}
        data-required-message={requiredMessage}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-moss/28 bg-white/58 p-6 text-sm text-ink/68">{children}</div>;
}
