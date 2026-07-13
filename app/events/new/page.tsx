import { EventForm } from "@/components/event-form";
import { Card, PageHeader } from "@/components/ui";
import { createEventAction, saveEventDraftAction } from "@/lib/actions/events";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data: draft } = user
    ? await supabase.from("event_drafts").select("payload").eq("owner_user_id", user.id).maybeSingle()
    : { data: null };
  const draftEvent = (draft?.payload ?? undefined) as Parameters<typeof EventForm>[0]["event"];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Events" title="イベントを作る" description="まずはイベント名だけ決めます。作成後、そのまま候補日時と回答期限を入力します。" />
      <Card>
        <EventForm action={createEventAction} draftAction={saveEventDraftAction} event={draftEvent} submitLabel="参加者募集へ進む" />
      </Card>
    </div>
  );
}
