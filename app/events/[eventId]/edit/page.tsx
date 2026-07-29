import { notFound } from "next/navigation";

import { EventForm } from "@/components/event-form";
import { BackLink } from "@/components/back-link";
import { Card, PageHeader } from "@/components/ui";
import { updateEventAction } from "@/lib/actions/events";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", eventId).single();

  if (!event) {
    notFound();
  }

  const action = updateEventAction.bind(null, eventId);

  return (
    <div className="space-y-6">
      <BackLink href={`/events/${eventId}`}>イベント詳細へ戻る</BackLink>
      <PageHeader eyebrow="Event" title="イベント編集" description={event.title} />
      <Card>
        <EventForm action={action} event={event} submitLabel="イベントを更新" />
      </Card>
    </div>
  );
}
