"use client";

import { Check, Copy, Link2, Users } from "lucide-react";
import React from "react";
import { useState } from "react";

type InviteStatus = "open" | "closed" | "revoked";

export function EventMemberInviteCard({
  memberCount,
  inviteUrl,
  status,
  closeInviteAction,
  reissueInviteAction
}: {
  memberCount: number;
  inviteUrl: string | null;
  status: InviteStatus | null;
  closeInviteAction: (formData: FormData) => void | Promise<void>;
  reissueInviteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);

  async function copyInviteUrl() {
    if (!inviteUrl) {
      return;
    }

    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const isOpen = status === "open";

  return (
    <section className="space-y-4" aria-labelledby="member-invite-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="h-5 w-5 text-pine" />
            <h2 id="member-invite-heading" className="text-xl font-semibold text-ink">
              参加者
            </h2>
          </div>
          <p className="mt-2 text-sm text-ink/65">Google ログインと Google Calendar 連携を済ませた人が参加できます。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={isOpen ? "rounded-full bg-skywash px-3 py-1.5 text-sm font-bold text-pine" : "rounded-full bg-ink/7 px-3 py-1.5 text-sm font-bold text-ink/65"}>
            {isOpen ? "参加受付中" : "参加受付終了"}
          </span>
          <span className="rounded-full bg-moss/12 px-3 py-1.5 text-sm font-bold text-pine">参加済み {memberCount}人</span>
        </div>
      </div>

      {inviteUrl && isOpen ? (
        <div className="space-y-3 rounded-lg border border-moss/25 bg-moss/5 p-4">
          <p className="text-sm font-semibold text-ink">招待リンクを送って参加者を集めましょう。</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-md bg-white/85 px-3 py-2 text-sm text-ink">{inviteUrl}</code>
            <button
              type="button"
              onClick={copyInviteUrl}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              aria-live="polite"
            >
              {copied ? <Check aria-hidden="true" className="mr-2 h-4 w-4" /> : <Copy aria-hidden="true" className="mr-2 h-4 w-4" />}
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={closeInviteAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                参加受付を終了して日程調整へ進む
              </button>
            </form>
            <form action={reissueInviteAction}>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                <Link2 aria-hidden="true" className="mr-2 h-4 w-4" />
                新しいリンクを発行
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-ink/10 bg-white/65 p-4 text-sm text-ink/70">
          {status === "closed" ? "参加受付は終了しています。参加者を追加する場合は、新しい招待リンクを発行してください。" : "招待リンクを準備しています。"}
          <form action={reissueInviteAction} className="mt-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              <Link2 aria-hidden="true" className="mr-2 h-4 w-4" />
              新しいリンクを発行
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
