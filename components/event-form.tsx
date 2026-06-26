import { categoryLabels, EVENT_CATEGORIES } from "@/lib/constants";
import { SubmitButton, SelectField, TextArea, TextField } from "@/components/ui";

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
      <SelectField
        label="カテゴリ"
        name="category"
        defaultValue={event?.category ?? ""}
        required
        options={[
          { value: "", label: "選択してね" },
          ...EVENT_CATEGORIES.map((category) => ({ value: category, label: categoryLabels[category] }))
        ]}
      />
      <TextField label="予定名" name="title" defaultValue={event?.title} required placeholder="例: 7月の謎解き会" />
      <TextField label="URL" name="url" type="url" defaultValue={event?.url} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="場所" name="location_name" defaultValue={event?.location_name} />
        <TextField label="住所" name="address" defaultValue={event?.address} />
      </div>
      <TextArea label="メモ" name="memo" defaultValue={event?.memo} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
