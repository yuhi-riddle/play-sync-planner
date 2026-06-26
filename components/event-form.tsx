import { categoryLabels, EVENT_CATEGORIES, EVENT_STATUSES, eventStatusLabels } from "@/lib/constants";
import { SubmitButton, SelectField, TextArea, TextField } from "@/components/ui";
import { toDateInputValue } from "@/lib/format";

type EventRecord = {
  category?: string;
  title?: string;
  url?: string | null;
  location_name?: string | null;
  address?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  price?: number | null;
  capacity?: number | null;
  status?: string;
  memo?: string | null;
};

export function EventForm({
  action,
  event,
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  event?: EventRecord;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label="カテゴリ"
          name="category"
          defaultValue={event?.category ?? "nazotoki"}
          options={EVENT_CATEGORIES.map((category) => ({ value: category, label: categoryLabels[category] }))}
        />
        <SelectField
          label="ステータス"
          name="status"
          defaultValue={event?.status ?? "interested"}
          options={EVENT_STATUSES.map((status) => ({ value: status, label: eventStatusLabels[status] }))}
        />
      </div>
      <TextField label="タイトル" name="title" defaultValue={event?.title} required />
      <TextField label="URL" name="url" type="url" defaultValue={event?.url} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="開催場所" name="location_name" defaultValue={event?.location_name} />
        <TextField label="住所" name="address" defaultValue={event?.address} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="開催開始日" name="start_date" type="date" defaultValue={toDateInputValue(event?.start_date)} />
        <TextField label="開催終了日" name="end_date" type="date" defaultValue={toDateInputValue(event?.end_date)} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="料金" name="price" type="number" defaultValue={event?.price} />
        <TextField label="定員" name="capacity" type="number" defaultValue={event?.capacity} />
      </div>
      <TextArea label="メモ" name="memo" defaultValue={event?.memo} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
