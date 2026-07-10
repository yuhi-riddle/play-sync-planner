import { notFound, redirect } from "next/navigation";

import { Card, PageHeader, SecondaryLink, SubmitButton } from "@/components/ui";
import { joinEventFromInviteAction } from "@/lib/actions/event-members";
import { createSupabaseAdminClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
        <PageHeader title="参加受付は終了しています" description="この招待リンクからは新しく参加できません。主催者に新しいリンクを依頼してください。" />
        <Card>
          <SecondaryLink href="/">ホームへ戻る</SecondaryLink>
        </Card>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="space-y-6">
        <PageHeader title={`${eventTitle} に参加する`} description="参加には Google Calendar 連携が必要です。予定の名前や場所は主催者には共有されません。" />
        <Card className="max-w-xl space-y-4">
          <p className="text-sm leading-6 text-ink/70">連携後、この招待ページへ戻って参加を完了します。</p>
          <a
            href={`/api/google-calendar/connect?next=${encodeURIComponent(invitePath)}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            Google Calendar を連携する
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${eventTitle} に参加する`} description="参加すると、主催者の空き時間集計にあなたの予定の空き状況だけが反映されます。" />
      <Card className="max-w-xl space-y-4">
        <p className="text-sm leading-6 text-ink/70">予定の名前、場所、個別の空き時間は主催者や他の参加者には表示されません。</p>
        <form action={joinEventFromInviteAction.bind(null, token)}>
          <SubmitButton>参加する</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
