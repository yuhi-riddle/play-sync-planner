import React from "react";
import { CalendarCheck, CalendarX } from "lucide-react";

import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/shared/format";

export function CalendarConnectionCard({
  connected,
  accountEmail,
  updatedAt,
  status,
  nextPath
}: {
  connected: boolean;
  accountEmail: string | null;
  updatedAt: string | null;
  canWriteEvents?: boolean;
  status?: string;
  nextPath?: string;
}) {
  const connectHref = nextPath ? `/api/google-calendar/connect?next=${encodeURIComponent(nextPath)}` : "/api/google-calendar/connect";

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {connected ? (
              <CalendarCheck aria-hidden="true" className="h-5 w-5 text-pine" />
            ) : (
              <CalendarX aria-hidden="true" className="h-5 w-5 text-clay-ink" />
            )}
            <h2 className="text-lg font-bold text-ink">Google Calendar連携</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted">
            連携すると、候補日時を作るときや回答するときに自分の予定を見ながら調整できます。日程確定後は、主催者がGoogle Calendarに予定を作成して、連携済みの参加者へ招待できます。
          </p>
          {status === "error" ? (
            <p className="mt-3 rounded-control border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
              Google Calendarと接続できませんでした。もう一度試してください。
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="text-muted">状態</dt>
              <dd className="font-bold text-ink">{connected ? "連携済み" : "未連携"}</dd>
            </div>
            {connected ? (
              <>
                <div>
                  <dt className="text-muted">アカウント</dt>
                  <dd className="font-bold text-ink">{accountEmail ?? "Google Calendar"}</dd>
                </div>
                <div>
                  <dt className="text-muted">最終更新</dt>
                  <dd className="font-bold text-ink">{formatDateTime(updatedAt)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        {connected ? (
          <form action="/api/google-calendar/disconnect" method="post">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              連携を解除
            </button>
          </form>
        ) : (
          <a
            href={connectHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            Google Calendarを連携
          </a>
        )}
      </div>
    </Card>
  );
}
