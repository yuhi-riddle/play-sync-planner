import { EventForm } from "@/components/event-form";
import { Card, PageHeader } from "@/components/ui";
import { createEventAction } from "@/lib/actions/events";

export default function NewEventPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="予定を作る" description="まずは予定名だけ決めます。作成後、そのまま候補日時と回答期限を入力します。" />
      <Card>
        <EventForm action={createEventAction} submitLabel="候補日時へ進む" />
      </Card>
    </div>
  );
}
