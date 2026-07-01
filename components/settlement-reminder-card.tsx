"use client";

import { Check, Copy } from "lucide-react";
import React, { useState } from "react";

import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export function SettlementReminderCard({
  recipientNames,
  message,
  markSentAction,
  latestSentAt,
  sentCount = 0,
  textareaLabel = "清算リマインド文面",
  markSentLabel = "送信済みに記録",
  emptyText = "未払いの清算はありません。"
}: {
  recipientNames: string[];
  message: string;
  markSentAction: (formData: FormData) => void | Promise<void>;
  latestSentAt?: string | null;
  sentCount?: number;
  textareaLabel?: string;
  markSentLabel?: string;
  emptyText?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (recipientNames.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {recipientNames.map((name) => (
          <span key={name} className="rounded-full bg-mist/45 px-3 py-1 text-xs font-bold text-pine">
            {name}
          </span>
        ))}
      </div>
      <textarea
        className="min-h-36 w-full resize-y rounded-lg border border-ink/10 bg-white/82 p-3 text-sm leading-6 text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
        value={message}
        readOnly
        aria-label={textareaLabel}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copyMessage}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          aria-live="polite"
        >
          {copied ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
          {copied ? "コピーしました" : "文面をコピー"}
        </button>
        <form action={markSentAction}>
          <input type="hidden" name="recipient_names" value={recipientNames.join("\n")} />
          <input type="hidden" name="reminder_message" value={message} />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            {markSentLabel}
          </button>
        </form>
      </div>
      <p className="text-sm text-ink/60">
        {latestSentAt ? `前回: ${formatDateTime(latestSentAt)}` : "まだ送信記録はありません。"} / 記録済み {sentCount}回
      </p>
    </div>
  );
}
