"use client";

import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import React from "react";
import { useState } from "react";

import { EmptyState } from "@/components/ui";

type ShareLinkAction = (formData: FormData) => void | Promise<void>;

const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2";

function ReissueButton({ action }: { action: ShareLinkAction }) {
  return (
    <form action={action}>
      <button type="submit" className={secondaryButtonClass}>
        <Link2 aria-hidden="true" className="mr-2 h-4 w-4" />
        新しいリンクを発行
      </button>
    </form>
  );
}

export function ShareLinkCard({
  shareUrl,
  revokeAction,
  reissueAction
}: {
  shareUrl: string | null;
  revokeAction?: ShareLinkAction;
  reissueAction?: ShareLinkAction;
}) {
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
    return (
      <div className="space-y-3">
        <EmptyState>
          有効な共有リンクがありません。新しいリンクを発行すると、参加者にもう一度共有できます。
        </EmptyState>
        {reissueAction ? <ReissueButton action={reissueAction} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a
        href={shareUrl}
        className="flex items-center justify-between gap-3 rounded-control border border-line bg-skywash/60 p-3 text-sm font-semibold text-ink transition-colors hover:border-moss/45 focus:outline-none focus:ring-2 focus:ring-clay"
        target="_blank"
        rel="noreferrer"
      >
        <span className="min-w-0 break-all">{shareUrl}</span>
        <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      </a>
      <button type="button" onClick={copyShareUrl} className={secondaryButtonClass} aria-live="polite">
        {copied ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
        {copied ? "コピーしました" : "リンクをコピー"}
      </button>
      <a
        href={shareUrl}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-br from-pine to-pine-deep px-4 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:from-pine-deep hover:to-pine-deep focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        自分も回答する
      </a>
      {revokeAction || reissueAction ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {revokeAction ? (
            <form action={revokeAction}>
              <button type="submit" className={secondaryButtonClass}>
                リンクを無効化
              </button>
            </form>
          ) : null}
          {reissueAction ? <ReissueButton action={reissueAction} /> : null}
          <p className="w-full text-caption text-muted">
            リンクが外部に漏れたときは無効化してください。新しいリンクを発行すると、古いリンクは使えなくなります。
          </p>
        </div>
      ) : null}
    </div>
  );
}
