import Link from "next/link";
import React from "react";
import type { ReactNode } from "react";
import { clsx } from "clsx";

import { brand } from "@/lib/brand";

/**
 * 表示だけのプリミティブ（hooksもイベントハンドラも使わない）。
 * "use client" を付けないことで、これらを使うページはクライアントバンドルを背負わずに済む。
 * フォーム系（MadoiForm/MadoiSelect等）は `./ui-client` にある。両方とも `./ui` から再エクスポートしている。
 */

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  summary
}: {
  title: string;
  description?: string;
  /** 画面のカテゴリ。省略するとブランド名になるが、原則として画面ごとの語を渡す */
  eyebrow?: string;
  action?: ReactNode;
  /** タイトルの下に出す状態の要約。バッジなどを渡す */
  summary?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-eyebrow uppercase text-pine">{eyebrow ?? brand.shortName}</p>
        <h1 className="mt-2 break-words text-display text-ink">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-body text-muted">{description}</p> : null}
        {summary ? <div className="mt-3">{summary}</div> : null}
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
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

/** ページ読み込み中のプレースホルダー1本分。幅・高さは className で渡す。 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx("animate-pulse rounded-control bg-sunken", className)} />;
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
