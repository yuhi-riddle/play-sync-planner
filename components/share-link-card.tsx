"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import React from "react";
import { useState } from "react";

import { EmptyState } from "@/components/ui";

export function ShareLinkCard({ shareUrl }: { shareUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copyShareUrl() {
    if (!shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!shareUrl) {
    return <EmptyState>共有リンクがありません。</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <a
        href={shareUrl}
        className="flex items-center justify-between gap-3 rounded-lg border border-ink/8 bg-skywash/60 p-3 text-sm font-semibold text-ink transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
        target="_blank"
        rel="noreferrer"
      >
        <span className="min-w-0 break-all">{shareUrl}</span>
        <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-ink/55" />
      </a>
      <button
        type="button"
        onClick={copyShareUrl}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        aria-live="polite"
      >
        {copied ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
        {copied ? "コピーしました" : "リンクをコピー"}
      </button>
      <a
        href={shareUrl}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        自分も回答する
      </a>
    </div>
  );
}
