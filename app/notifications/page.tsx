import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, CheckCheck } from "lucide-react";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import { Card, EmptyState, PageHeader, SubmitButton } from "@/components/ui";
import {
  filterNotificationsByReadState,
  type NotificationReadFilter
} from "@/lib/domain/site-notifications";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

const kindLabels: Record<string, string> = {
  answer_deadline: "回答期限",
  unanswered: "未回答",
  settlement_needed: "清算",
  payment_due: "支払い",
  confirmation_due: "受け取り確認",
  event_invitation: "招待",
  event_message: "チャット"
};

export default async function NotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const activeFilter: NotificationReadFilter = query.status === "read" ? "read" : "unread";

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Notifications" title="通知" description="Supabase の設定後に通知を確認できます。" />
        <EmptyState>環境変数がまだ設定されていません。</EmptyState>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Notifications" title="通知" description="通知を見るにはログインしてください。" />
        <EmptyState>ログインすると、対応が必要な日程調整や清算をここで確認できます。</EmptyState>
      </div>
    );
  }

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as NotificationRow[];
  const unreadCount = filterNotificationsByReadState(rows, "unread").length;
  const readCount = filterNotificationsByReadState(rows, "read").length;
  const notifications = filterNotificationsByReadState(rows, activeFilter);
  const countLabel = activeFilter === "read" ? `既読 ${readCount}件` : `未読 ${unreadCount}件`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Notifications"
        title="通知"
        description="回答期限、未回答、招待、チャット、清算などをまとめて確認します。"
        action={
          activeFilter === "unread" && unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <SubmitButton>
                <CheckCheck aria-hidden="true" className="mr-2 h-4 w-4" />
                すべて既読
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">通知一覧</h2>
            <p className="mt-1 text-sm text-muted">
              {activeFilter === "read" ? "既読にした通知を確認できます。" : "未読の通知だけを表示しています。"}
            </p>
          </div>
          <span className="w-fit rounded-full bg-surface px-3 py-1 text-xs font-bold text-muted">{countLabel}</span>
        </div>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="通知の表示切替">
          <NotificationFilterLink href="/notifications" active={activeFilter === "unread"}>
            未読 {unreadCount}
          </NotificationFilterLink>
          <NotificationFilterLink href="/notifications?status=read" active={activeFilter === "read"}>
            既読 {readCount}
          </NotificationFilterLink>
        </nav>

        <div className="mt-4 space-y-3">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className="rounded-control border border-line bg-surface p-4 transition-colors hover:border-moss/45"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link
                    href={safeHref(notification.href)}
                    className="group min-w-0 flex-1 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-mist/55 text-pine">
                        <Bell aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-pine">
                        {kindLabels[notification.kind] ?? "通知"}
                      </span>
                      <span className="rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay-ink">
                        {notification.read_at ? "既読" : "未読"}
                      </span>
                    </span>
                    <span className="mt-3 block text-base font-bold text-ink group-hover:text-pine">{notification.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">{notification.body}</span>
                    <span className="mt-2 block text-xs font-bold text-muted">{formatCreatedAt(notification.created_at)}</span>
                  </Link>

                  {!notification.read_at ? (
                    <form action={markNotificationReadAction.bind(null, notification.id)}>
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                      >
                        既読にする
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyState>{activeFilter === "read" ? "既読の通知はありません。" : "未読の通知はありません。"}</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}

function NotificationFilterLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white shadow-soft focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          : "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-muted transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      }
    >
      {children}
    </Link>
  );
}

function safeHref(value: string) {
  return value.startsWith("/") ? value : "/";
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}
