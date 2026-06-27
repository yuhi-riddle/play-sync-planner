import { submitAvailabilityAnswersAction } from "@/lib/actions/answers";
import { formatDateTimeRange } from "@/lib/format";
import { SubmitButton, TextField } from "@/components/ui";

type CandidateDate = {
  id: string;
  start_at: string;
  end_at: string | null;
};

export function AnswerForm({ token, candidateDates }: { token: string; candidateDates: CandidateDate[] }) {
  const action = submitAvailabilityAnswersAction.bind(null, token);

  return (
    <form action={action} className="grid gap-5">
      <TextField label="名前" name="displayName" required />
      <div className="grid gap-4">
        {candidateDates.map((candidate) => (
          <fieldset key={candidate.id} className="rounded-lg border border-white/80 bg-white/68 p-4">
            <legend className="px-1 text-sm font-semibold text-ink">{formatDateTimeRange(candidate.start_at, candidate.end_at)}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ["yes", "○ 行ける"],
                ["maybe", "△ たぶん行ける"],
                ["no", "× 行けない"]
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-full border border-ink/10 bg-cream/80 px-3 py-2 text-sm font-semibold">
                  <input type="radio" name={`answer:${candidate.id}`} value={value} required />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm font-medium text-ink">
              <span>コメント</span>
              <input
                className="mt-2 min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                name={`comment:${candidate.id}`}
              />
            </label>
          </fieldset>
        ))}
      </div>
      <div>
        <SubmitButton>回答する</SubmitButton>
      </div>
    </form>
  );
}
