import { categoryLabels, EVENT_CATEGORIES } from "@/lib/constants";
import { MadoiForm, SubmitButton, SelectField, TextArea, TextField } from "@/components/ui";

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
    <MadoiForm action={action} className="grid gap-5">
      <SelectField
        label="カテゴリ"
        name="category"
        defaultValue={event?.category ?? ""}
        required
        requiredMessage="カテゴリを選択してください"
        options={[
          { value: "", label: "---選択してください---", disabled: true },
          ...EVENT_CATEGORIES.map((category) => ({ value: category, label: categoryLabels[category] }))
        ]}
      />
      <TextField
        label="予定名"
        name="title"
        defaultValue={event?.title}
        required
        requiredMessage="予定名を入力してください"
        placeholder="例: 友人との予定 / 週末のお出かけ"
      />
      <TextField label="URL" name="url" type="url" defaultValue={event?.url} />
      <TextField
        label="場所メモ"
        name="location_name"
        defaultValue={event?.location_name}
        placeholder="例: 新宿駅周辺 / お店未定 / オンライン"
      />
      <TextArea label="メモ" name="memo" defaultValue={event?.memo} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </MadoiForm>
  );
}
