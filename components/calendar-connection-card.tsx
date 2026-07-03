import React from "react";
import { CalendarCheck, CalendarX } from "lucide-react";

import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export function CalendarConnectionCard({
  connected,
  accountEmail,
  updatedAt,
  canWriteEvents = false,
  status
}: {
  connected: boolean;
  accountEmail: string | null;
  updatedAt: string | null;
  canWriteEvents?: boolean;
  status?: string;
}) {
  const needsReconnect = connected && !canWriteEvents;

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {connected ? (
              <CalendarCheck aria-hidden="true" className="h-5 w-5 text-pine" />
            ) : (
              <CalendarX aria-hidden="true" className="h-5 w-5 text-clay" />
            )}
            <h2 className="text-lg font-bold text-ink">Google Calendar連携</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink/62">
            候補日時を作るときに自分の予定を確認できます。予定確定時には、確定した日程をGoogle Calendarに登録します。
          </p>
          {status === "error" ? (
            <p className="mt-3 rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm text-ink" aria-live="polite">
              Google Calendarと接続できませんでした。もう一度試してください。
            </p>
          ) : null}
          {needsReconnect ? (
            <p className="mt-3 rounded-lg border border-clay/25 bg-clay/10 p-3 text-sm leading-6 text-ink" aria-live="polite">
              今の連携は予定の読み取り専用です。確定した日程をGoogle Calendarへ登録するには、再連携してください。
            </p>
          ) : null}
          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="text-ink/54">状態</dt>
              <dd className="font-bold text-ink">{connected ? "連携済み" : "未連携"}</dd>
            </div>
            {connected ? (
              <>
                <div>
                  <dt className="text-ink/54">アカウント</dt>
                  <dd className="font-bold text-ink">{accountEmail ?? "Google Calendar"}</dd>
                </div>
                <div>
                  <dt className="text-ink/54">最終更新</dt>
                  <dd className="font-bold text-ink">{formatDateTime(updatedAt)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
        {connected ? (
          <div className="flex flex-col gap-2 sm:items-end">
            {needsReconnect ? (
              <a
                href="/api/google-calendar/connect"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                再連携する
              </a>
            ) : null}
            <form action="/api/google-calendar/disconnect" method="post">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/82 px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-clay hover:text-clay focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
              >
                連携を解除
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/api/google-calendar/connect"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            Google Calendarを連携
          </a>
        )}
      </div>
    </Card>
  );
}
