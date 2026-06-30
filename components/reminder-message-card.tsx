"use client";

import { Check, Copy } from "lucide-react";
import React from "react";
import { useState } from "react";

import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export function ReminderMessageCard({
  pendingNames,
  message,
  shareUrl,
  markSentAction,
  latestSentAt,
  sentCount = 0
}: {
  pendingNames: string[];
  message: string | null;
  shareUrl: string | null;
  markSentAction?: (formData: FormData) => void | Promise<void>;
  latestSentAt?: string | null;
  sentCount?: number;
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
          <div className="rounded-lg border border-white/75 bg-white/58 p-3 text-sm text-ink/66">
            <div className="flex flex-wrap items-center gap-2">
              <span>{latestSentAt ? `前回: ${formatDateTime(latestSentAt)}` : "まだ送信記録はありません"}</span>
              <span className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">記録済み {sentCount}回</span>
            </div>
            {markSentAction ? (
              <form action={markSentAction} className="mt-3">
                <input type="hidden" name="recipient_names" value={pendingNames.join("\n")} />
                <input type="hidden" name="reminder_message" value={message} />
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                >
                  送信済みに記録
                </button>
              </form>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState>共有リンクがありません。</EmptyState>
      )}
    </div>
  );
}
