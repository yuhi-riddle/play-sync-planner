"use client";

import { ReceiptText } from "lucide-react";
import React, { useActionState, useState } from "react";

import { MadoiForm, MadoiSelect, SubmitButton, TextArea, TextField } from "@/components/ui";
import type { ActionState } from "@/lib/domain/action-state";

const INITIAL_ACTION_STATE: ActionState = { status: "idle" };

type ParticipantOption = {
  id: string;
  displayName: string;
};

type ExpenseFormInitialValues = {
  title?: string | null;
  amount?: number | null;
  payerParticipantId?: string | null;
  memo?: string | null;
  paymentUrl?: string | null;
  isImportant?: boolean | null;
  splitMode?: "equal" | "individual";
  splitParticipantIds?: string[];
  individualAmounts?: Record<string, number>;
};

export function ExpenseForm({
  participants,
  action,
  initialValues,
  submitLabel = "支払いを追加"
}: {
  participants: ParticipantOption[];
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  initialValues?: ExpenseFormInitialValues;
  submitLabel?: string;
}) {
  const [actionState, formAction] = useActionState(action, INITIAL_ACTION_STATE);
  const [splitMode, setSplitMode] = useState<"equal" | "individual">(initialValues?.splitMode ?? "equal");
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(initialValues?.splitParticipantIds?.length ? initialValues.splitParticipantIds : participants.map((participant) => participant.id))
  );
  const [individualAmounts, setIndividualAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initialValues?.individualAmounts ?? {}).map(([participantId, amount]) => [participantId, String(amount)])
    )
  );

  const selectedCount = selectedIds.size;

  function toggleParticipant(participantId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(participantId);
      } else {
        next.delete(participantId);
      }
      return next;
    });
  }

  return (
    <MadoiForm
      action={formAction}
      serverError={actionState.status === "error" ? actionState.message : undefined}
      className="grid gap-5"
    >
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <TextField
          label="支払い内容"
          name="title"
          defaultValue={initialValues?.title}
          required
          requiredMessage="何の支払いか入力してください"
          placeholder="例: チケット代"
        />
        <TextField
          label="金額"
          name="amount"
          type="number"
          step={1}
          min={1}
          defaultValue={initialValues?.amount}
          required
          requiredMessage="金額を入力してください"
          placeholder="例: 3600"
        />
      </div>

      <label className="block text-sm font-medium text-ink">
        <span className="text-muted">支払った人</span>
        <div className="mt-2">
          <MadoiSelect
          name="payer_participant_id"
          defaultValue={initialValues?.payerParticipantId ?? ""}
            required
            requiredMessage="支払った人を選択してください"
            fieldLabel="支払った人"
            options={[
              { value: "", label: "選択してください", disabled: true },
              ...participants.map((participant) => ({ value: participant.id, label: participant.displayName }))
            ]}
          />
        </div>
      </label>

      <fieldset className="grid gap-3 rounded-control border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-bold text-ink">割り方</legend>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink">
            <input
              type="radio"
              name="split_mode"
              value="equal"
              checked={splitMode === "equal"}
              onChange={() => setSplitMode("equal")}
              className="h-4 w-4 text-moss focus:ring-clay"
            />
            均等割り
          </label>
          <label className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-ink">
            <input
              type="radio"
              name="split_mode"
              value="individual"
              checked={splitMode === "individual"}
              onChange={() => setSplitMode("individual")}
              className="h-4 w-4 text-moss focus:ring-clay"
            />
            個別金額
          </label>
        </div>

        <div className="grid gap-2">
          {participants.map((participant) => {
            const selected = selectedIds.has(participant.id);
            return (
              <div key={participant.id} className="grid gap-3 rounded-control border border-line bg-surface p-3 sm:grid-cols-[1fr_11rem] sm:items-center">
                <label className="flex items-center gap-3 text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    name={splitMode === "equal" ? "split_participant_ids" : undefined}
                    value={participant.id}
                    checked={selected}
                    onChange={(event) => toggleParticipant(participant.id, event.target.checked)}
                    className="h-5 w-5 rounded border-line text-moss focus:ring-clay"
                  />
                  {participant.displayName}
                </label>
                {splitMode === "individual" && selected ? (
                  <>
                    <input type="hidden" name="individual_participant_ids" value={participant.id} />
                    <input
                      name="individual_split_amounts"
                      type="number"
                      min={1}
                      step={1}
                      value={individualAmounts[participant.id] ?? ""}
                      onChange={(event) =>
                        setIndividualAmounts((current) => ({
                          ...current,
                          [participant.id]: event.target.value
                        }))
                      }
                      placeholder="負担額"
                      className="min-h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
                      aria-label={`${participant.displayName} の負担額`}
                    />
                  </>
                ) : (
                  <span className="text-sm text-muted">{splitMode === "equal" && selected ? `均等割り対象 ${selectedCount}人` : ""}</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="支払い用URL" name="payment_url" defaultValue={initialValues?.paymentUrl} placeholder="https://..." />
      </div>
      <label className="flex items-start gap-3 rounded-control border border-moss/18 bg-mist/30 p-3 text-sm text-ink">
        <input
          type="checkbox"
          name="is_important"
          defaultChecked={Boolean(initialValues?.isImportant)}
          className="mt-1 h-5 w-5 rounded border-line text-moss focus:ring-clay"
        />
        <span>
          <span className="block font-bold">重要メモとして表示</span>
          <span className="mt-1 block leading-6 text-muted">予約番号、当日見せる情報、高額なチケット代など、あとで見返したい支払いに付けます。</span>
        </span>
      </label>
      <TextArea label="メモ" name="memo" defaultValue={initialValues?.memo} rows={3} placeholder="例: 予約番号、当日必要な情報、購入ページの補足など" />

      <SubmitButton className="text-sm" icon={<ReceiptText aria-hidden="true" className="h-4 w-4" />} pendingChildren="保存中…">
        {submitLabel}
      </SubmitButton>
    </MadoiForm>
  );
}
