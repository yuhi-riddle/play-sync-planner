import { EventForm } from "@/components/event/event-form";
import { BackLink } from "@/components/ui/back-link";
import { Card, PageHeader } from "@/components/ui";
import { createEventAction, saveEventDraftAction } from "@/lib/actions/event/events";
import { shouldResumeEventDraft } from "@/lib/domain/event/event-flow";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export default async function NewEventPage({
  searchParams
}: {
  searchParams?: Promise<{ resume?: string | string[] }>;
}) {
  const query = (await searchParams) ?? {};
  let draftEvent: Parameters<typeof EventForm>[0]["event"];

  if (shouldResumeEventDraft(query.resume)) {
    const user = await getCurrentUser();
    if (user) {
      const supabase = await createSupabaseServerClient();
      const result = await supabase.from("event_drafts").select("payload").eq("owner_user_id", user.id).maybeSingle();
      draftEvent = result.data?.payload as Parameters<typeof EventForm>[0]["event"];
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href="/events">イベント一覧へ戻る</BackLink>
      <PageHeader eyebrow="Events" title="イベントを作る" description="まずはイベント名だけ決めます。作成後、そのまま候補日時と回答期限を入力します。" />
      <Card>
        <EventForm action={createEventAction} draftAction={saveEventDraftAction} event={draftEvent} submitLabel="参加者募集へ進む" />
      </Card>
    </div>
  );
}
