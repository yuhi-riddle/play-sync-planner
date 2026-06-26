import { confirmPlanAction } from "@/lib/actions/confirm";
import { SubmitButton } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

type CandidateSummary = {
  id: string;
  start_at: string;
  end_at: string | null;
  yes: number;
  maybe: number;
  no: number;
  unanswered: number;
  recommended: boolean;
};

export function ConfirmForm({ planId, candidates }: { planId: string; candidates: CandidateSummary[] }) {
  const action = confirmPlanAction.bind(null, planId);

  return (
    <form action={action} className="grid gap-4">
      {candidates.map((candidate) => (
        <label key={candidate.id} className="block rounded-lg border border-white/80 bg-white/68 p-4">
          <div className="flex items-start gap-3">
            <input className="mt-1" type="radio" name="candidateDateId" value={candidate.id} required />
            <div>
              <p className="font-semibold text-ink">
                {formatDateTime(candidate.start_at)}
                {candidate.recommended ? <span className="ml-2 text-sm text-clay">おすすめ</span> : null}
              </p>
              <p className="mt-2 text-sm text-ink/70">
                ○ {candidate.yes} / △ {candidate.maybe} / × {candidate.no} / 未回答 {candidate.unanswered}
              </p>
            </div>
          </div>
        </label>
      ))}
      <div>
        <SubmitButton>この日程で確定</SubmitButton>
      </div>
    </form>
  );
}
