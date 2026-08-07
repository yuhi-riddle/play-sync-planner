import { notFound, redirect } from "next/navigation";

import { Card, PageHeader, SecondaryLink, SubmitButton } from "@/components/ui";
import { joinEventFromInviteAction } from "@/lib/actions/event/event-members";
import { createSupabaseAdminClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// トークンだけで参加できる公開URLなので、検索エンジンに載せない。
export const metadata = {
  robots: { index: false, follow: false }
};

export default async function EventInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitePath = `/invites/${token}`;
  const admin = createSupabaseAdminClient();
  const { data: invite } = await admin
    .from("event_invite_links")
    .select("event_id, status, events(title)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    notFound();
  }

  const eventTitle = (invite.events as { title?: string | null } | null)?.title ?? "このイベント";
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(invitePath)}`);
  }

  const { data: integration } = await admin
    .from("calendar_integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  const { data: membership } = await admin
    .from("event_members")
    .select("status")
    .eq("event_id", invite.event_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership?.status === "joined") {
    redirect(`/events/${invite.event_id}`);
  }

  if (invite.status !== "open") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Invite" title="参加受付は終了しています" description="この招待リンクからは新しく参加できません。主催者に新しいリンクを依頼してください。" />
        <Card>
          <SecondaryLink href="/">ホームへ戻る</SecondaryLink>
        </Card>
      </div>
    );
  }

  /*
   * 連携は参加の条件ではない。Googleカレンダーを使っていない人も参加できる。
   * 連携済みかどうかで、参加ボタンの下に出す案内だけを変える。
   */
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Invite"
        title={`${eventTitle} に参加する`}
        description={
          integration
            ? "参加すると、主催者の空き時間集計にあなたの予定の空き状況だけが反映されます。"
            : "そのまま参加できます。Google Calendar を連携すると、空いている日時が自動で埋まります。"
        }
      />
      <Card className="max-w-xl space-y-4">
        <p className="text-sm leading-6 text-muted">予定の名前、場所、個別の空き時間は主催者や他の参加者には表示されません。</p>
        <form action={joinEventFromInviteAction.bind(null, token)}>
          <SubmitButton>参加する</SubmitButton>
        </form>
        {integration ? null : (
          <div className="rounded-control border border-line bg-sunken p-4">
            <p className="text-sm leading-6 text-ink">
              連携しなくても参加できます。連携すると、候補日時に自分で○×を付ける手間が減ります。
            </p>
            <a
              href={`/api/google-calendar/connect?next=${encodeURIComponent(invitePath)}`}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
            >
              Google Calendar を連携する
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
