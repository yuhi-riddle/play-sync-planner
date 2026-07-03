import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/notifications";
import { Card, EmptyState, PageHeader, SubmitButton } from "@/components/ui";
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
  confirmation_due: "受け取り確認"
};

export default async function NotificationsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="通知" description="Supabase の設定後に通知を確認できます。" />
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
        <PageHeader title="通知" description="通知を見るにはログインしてください。" />
        <EmptyState>ログインすると、対応が必要な予定や清算をここで確認できます。</EmptyState>
      </div>
    );
  }

  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(80);

  const notifications = (data ?? []) as NotificationRow[];
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="通知"
        description="回答期限、未回答、清算、支払い確認など、対応が必要なことをまとめて確認します。"
        action={
          unreadCount > 0 ? (
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">通知一覧</h2>
          <span className="rounded-full bg-white/76 px-3 py-1 text-xs font-bold text-ink/60">未読 {unreadCount}件</span>
        </div>

        <div className="mt-4 space-y-3">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <article
                key={notification.id}
                className="rounded-lg border border-ink/8 bg-white/66 p-4 transition-colors hover:border-moss/45"
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
                      <span className="rounded-full bg-cream/86 px-3 py-1 text-xs font-bold text-pine">
                        {kindLabels[notification.kind] ?? "通知"}
                      </span>
                      {!notification.read_at ? (
                        <span className="rounded-full bg-clay/12 px-3 py-1 text-xs font-bold text-clay">未読</span>
                      ) : null}
                    </span>
                    <span className="mt-3 block text-base font-bold text-ink group-hover:text-pine">{notification.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-ink/65">{notification.body}</span>
                    <span className="mt-2 block text-xs font-bold text-ink/45">{formatCreatedAt(notification.created_at)}</span>
                  </Link>

                  {!notification.read_at ? (
                    <form action={markNotificationReadAction.bind(null, notification.id)}>
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-ink/10 bg-white/78 px-4 py-2 text-sm font-bold text-ink/70 transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
                      >
                        既読にする
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyState>通知はまだありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
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
