"use client";

import React, { useState, useTransition } from "react";

import { respondToEventUserInvitationAction } from "@/lib/actions/connections";

export type ReceivedEventInvitation = {
  id: string;
  eventTitle: string;
  organizerName: string;
  createdAt: string;
};

export function ReceivedEventInvitations({ invitations }: { invitations: ReceivedEventInvitation[] }) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="received-event-invitations-heading" className="rounded-control border border-line bg-surface p-5 shadow-soft">
      <h2 id="received-event-invitations-heading" className="text-xl font-semibold text-ink">届いた招待</h2>
      <div className="mt-4 space-y-3">
        {invitations.map((invitation) => <ReceivedEventInvitationRow key={invitation.id} invitation={invitation} />)}
      </div>
    </section>
  );
}

function ReceivedEventInvitationRow({ invitation }: { invitation: ReceivedEventInvitation }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function respond(response: "accepted" | "declined") {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await respondToEventUserInvitationAction(invitation.id, response);
        if (result.status === "error") {
          setError(result.message ?? "招待を更新できませんでした");
          return;
        }
        setMessage(response === "accepted" ? "参加しました" : "今回は見送りました");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "招待を更新できませんでした");
      }
    });
  }

  return (
    <article className="rounded-control border border-line bg-surface p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{invitation.eventTitle}</p>
          <p className="mt-1 text-sm text-muted">主催者: {invitation.organizerName}</p>
          <time className="mt-1 block text-sm text-muted" dateTime={invitation.createdAt}>
            {new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(invitation.createdAt))}
          </time>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending || message !== null} onClick={() => respond("accepted")} className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            参加する
          </button>
          <button type="button" disabled={isPending || message !== null} onClick={() => respond("declined")} className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            今回は見送る
          </button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-pine" role="status">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-semibold text-clay-ink" role="alert">{error}</p> : null}
    </article>
  );
}
