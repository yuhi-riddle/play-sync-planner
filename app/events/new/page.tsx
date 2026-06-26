import { EventForm } from "@/components/event-form";
import { Card, PageHeader } from "@/components/ui";
import { createEventAction } from "@/lib/actions/events";

export default function NewEventPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="イベント作成" description="謎解き公演など、参加予定の元になる情報を登録します。" />
      <Card>
        <EventForm action={createEventAction} submitLabel="イベントを作成" />
      </Card>
    </div>
  );
}
