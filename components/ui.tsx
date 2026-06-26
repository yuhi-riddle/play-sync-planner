import Link from "next/link";
import type { ReactNode } from "react";
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

export function TextField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  helpText,
  step
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  step?: number;
}) {
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
  helpText
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}) {
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
  required
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-ink">
      <span className="text-ink/72">{label}</span>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
        name={name}
        defaultValue={defaultValue}
        required={required}
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
