"use client";

import { Check, Copy } from "lucide-react";
import React from "react";
import { useState } from "react";

import { EmptyState } from "@/components/ui";

export function ReminderMessageCard({
  pendingNames,
  message,
  shareUrl
}: {
  pendingNames: string[];
  message: string | null;
  shareUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    if (!message) {
      return;
    }

    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (pendingNames.length === 0) {
    return <EmptyState>未回答者はいません。</EmptyState>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {pendingNames.map((name) => (
          <span key={name} className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">
            {name}
          </span>
        ))}
      </div>

      {message && shareUrl ? (
        <>
          <textarea
            className="min-h-40 w-full resize-y rounded-lg border border-ink/10 bg-white/82 p-3 text-sm leading-6 text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            value={message}
            readOnly
            aria-label="リマインド文面"
          />
          <button
            type="button"
            onClick={copyMessage}
            className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            aria-live="polite"
          >
            {copied ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
            {copied ? "コピーしました" : "文面をコピー"}
          </button>
        </>
      ) : (
        <EmptyState>共有リンクがありません。</EmptyState>
      )}
    </div>
  );
}
