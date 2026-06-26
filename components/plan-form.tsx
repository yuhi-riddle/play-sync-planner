import { SubmitButton, TextArea, TextField } from "@/components/ui";
import { toDateTimeLocalValue } from "@/lib/format";

type PlanRecord = {
  title?: string | null;
  answer_deadline_at?: string | null;
  memo?: string | null;
  participants?: Array<{ display_name: string }>;
  candidate_dates?: Array<{ start_at: string }>;
};

export function PlanForm({
  action,
  plan,
  submitLabel
}: {
  action: (formData: FormData) => void | Promise<void>;
  plan?: PlanRecord;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-5">
      <TextField label="参加予定名" name="title" defaultValue={plan?.title} placeholder="例: 7月の謎解き会" />
      <TextArea
        label="参加者名"
        name="participantNames"
        defaultValue={plan?.participants?.map((participant) => participant.display_name).join("\n")}
        rows={5}
        required
        placeholder={"山田\n佐藤\n田中"}
        helpText="1行に1人ずつ入力します。共有リンクから回答した人も参加者に追加されます。"
      />
      <TextArea
        label="候補日"
        name="candidateDates"
        defaultValue={plan?.candidate_dates?.map((candidate) => toDateTimeLocalValue(candidate.start_at)).join("\n")}
        rows={5}
        required
        placeholder={"2026-07-12T13:00\n2026-07-13T18:30"}
        helpText="1行に1候補ずつ入力します。形式は YYYY-MM-DDTHH:mm です。"
      />
      <TextField
        label="回答期限"
        name="answer_deadline_at"
        type="datetime-local"
        defaultValue={toDateTimeLocalValue(plan?.answer_deadline_at)}
      />
      <TextArea label="メモ" name="memo" defaultValue={plan?.memo} />
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
