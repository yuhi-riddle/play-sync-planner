"use client";

import { ReceiptText } from "lucide-react";
import React, { useMemo, useState } from "react";

import { TextArea, TextField } from "@/components/ui";

type ParticipantOption = {
  id: string;
  displayName: string;
};

export function ExpenseForm({
  participants,
  action
}: {
  participants: ParticipantOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [splitMode, setSplitMode] = useState<"equal" | "individual">("equal");
  const [selectedIds, setSelectedIds] = useState(() => new Set(participants.map((participant) => participant.id)));
  const [individualAmounts, setIndividualAmounts] = useState<Record<string, string>>({});

  const selectedCount = selectedIds.size;
  const selectedParticipants = useMemo(
    () => participants.filter((participant) => selectedIds.has(participant.id)),
    [participants, selectedIds]
  );

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
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <TextField label="支払い内容" name="title" required requiredMessage="何の支払いか入力してください" placeholder="例: チケット代" />
        <TextField label="金額" name="amount" type="number" step={1} min={0} required requiredMessage="金額を入力してください" placeholder="例: 3600" />
      </div>

      <label className="block text-sm font-medium text-ink">
        <span className="text-ink/72">支払った人</span>
        <select
          name="payer_participant_id"
          required
          className="mt-2 min-h-11 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
          onInvalid={(event) => event.currentTarget.setCustomValidity("支払った人を選択してください")}
          onInput={(event) => event.currentTarget.setCustomValidity("")}
          defaultValue=""
        >
          <option value="" disabled>
            --- 選択してください ---
          </option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.displayName}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-3 rounded-lg border border-white/75 bg-white/58 p-4">
        <legend className="px-1 text-sm font-bold text-ink">割り方</legend>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-cream/80 px-4 py-2 text-sm font-bold text-ink">
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
          <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-cream/80 px-4 py-2 text-sm font-bold text-ink">
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
              <div key={participant.id} className="grid gap-3 rounded-lg border border-ink/8 bg-cream/60 p-3 sm:grid-cols-[1fr_11rem] sm:items-center">
                <label className="flex items-center gap-3 text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    name={splitMode === "equal" ? "split_participant_ids" : undefined}
                    value={participant.id}
                    checked={selected}
                    onChange={(event) => toggleParticipant(participant.id, event.target.checked)}
                    className="h-5 w-5 rounded border-ink/20 text-moss focus:ring-clay"
                  />
                  {participant.displayName}
                </label>
                {splitMode === "individual" && selected ? (
                  <>
                    <input type="hidden" name="individual_participant_ids" value={participant.id} />
                    <input
                      name="individual_split_amounts"
                      type="number"
                      min={0}
                      step={1}
                      value={individualAmounts[participant.id] ?? ""}
                      onChange={(event) =>
                        setIndividualAmounts((current) => ({
                          ...current,
                          [participant.id]: event.target.value
                        }))
                      }
                      placeholder="負担額"
                      className="min-h-10 w-full rounded-lg border border-ink/10 bg-white/88 px-3 py-2 text-base text-ink outline-none transition-colors focus:border-moss focus:ring-2 focus:ring-moss/20"
                      aria-label={`${participant.displayName} の負担額`}
                    />
                  </>
                ) : (
                  <span className="text-sm text-ink/55">{splitMode === "equal" && selected ? `均等割り対象 ${selectedCount}人` : ""}</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="支払い方法メモ" name="payment_method" placeholder="例: PayPay、銀行振込、現金" />
        <TextField label="支払い用URL" name="payment_url" placeholder="https://..." />
      </div>
      <TextArea label="メモ" name="memo" rows={3} placeholder="補足があれば入力します。" />

      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        <ReceiptText aria-hidden="true" className="h-4 w-4" />
        支払いを追加
      </button>
    </form>
  );
}
