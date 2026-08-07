"use client";

import { clsx } from "clsx";
import { ReceiptText } from "lucide-react";
import React, { useActionState, useId, useMemo, useState } from "react";

import { MadoiForm, MadoiSelect, SubmitButton, TextArea, TextField } from "@/components/ui";
import type { ActionState } from "@/lib/domain/shared/action-state";
import { equalSplitShare, individualSplitTally } from "@/lib/domain/settlement/expense-split";
import { formatYenText } from "@/lib/shared/format";

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

/**
 * 立替支払いの入力。
 *
 * 立替のほとんどは「全員で均等割り」なので、その場合は割り方を1行に畳んでおき、
 * 内容・金額・支払った人・保存の4操作で終わるようにしている。
 * 割り方と詳細は畳んでいる間も DOM に残す（hidden / details）。送信される
 * フィールドは開閉に関わらず同じで、サーバー側は何も変わらない。
 */
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
  // 清算ページは追加フォームと経費ごとの編集フォームを同じ画面に並べるので、
  // aria-controls の参照先が重複しないよう id をインスタンスごとに振る。
  const splitFieldsId = useId();
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

  // 金額は非制御のまま input に持たせ、ここでは「1人あたり」と差額を出すためだけに写しを持つ。
  const [amountText, setAmountText] = useState(initialValues?.amount == null ? "" : String(initialValues.amount));
  const amount = Number.parseInt(amountText, 10);

  const [splitOpen, setSplitOpen] = useState(false);
  // 個別金額は1行では言い表せないので、そのモードの間は必ず開いておく。
  // こうしておくと、畳まれた要約が実際の割り方と食い違うことがない。
  const splitExpanded = splitOpen || splitMode === "individual";

  const selectedCount = selectedIds.size;
  const share = equalSplitShare(amount, selectedCount);

  const tally = useMemo(
    () =>
      individualSplitTally(
        amount,
        participants
          .filter((participant) => selectedIds.has(participant.id))
          .map((participant) => Number.parseInt(individualAmounts[participant.id] ?? "", 10))
      ),
    [amount, individualAmounts, participants, selectedIds]
  );

  const [detailsOpen] = useState(() =>
    Boolean(initialValues?.paymentUrl || initialValues?.memo || initialValues?.isImportant)
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

  const splitSummary = [
    selectedCount === participants.length ? "全員で均等割り" : `${selectedCount}人で均等割り`,
    share ? `1人あたり ${share.min === share.max ? formatYenText(share.min) : `${formatYenText(share.min)}〜${formatYenText(share.max)}`}` : null
  ]
    .filter(Boolean)
    .join(" · ");

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
          onValueChange={setAmountText}
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

      {splitExpanded ? null : (
        <div className="flex items-center gap-3 rounded-control border border-moss/28 bg-mist px-4 py-3 text-sm font-bold text-pine">
          <span className="min-w-0">{splitSummary}</span>
          <button
            type="button"
            onClick={() => setSplitOpen(true)}
            aria-expanded={false}
            aria-controls={splitFieldsId}
            className="ml-auto inline-flex min-h-9 shrink-0 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
          >
            割り方を変える
          </button>
        </div>
      )}

      {/*
        畳んでいる間も DOM に残す。display:none になるだけなので、中のチェックボックスは
        今までどおり送信される（disabled ではない）。

        display は hidden 属性ではなくクラスで切り替える。hidden 属性が効くのは
        UAスタイルシートの [hidden] { display: none } だけで、クラスセレクタの
        .grid { display: grid } に負けるため（Card の p-4 が p-5 に負けたのと同じ）。
        属性も残すのは、支援技術に「今は無い」と伝えるため。
      */}
      <fieldset
        id={splitFieldsId}
        data-testid="expense-split-fields"
        hidden={!splitExpanded}
        className={clsx(
          splitExpanded ? "grid gap-3" : "hidden",
          "rounded-control border border-line bg-surface p-4"
        )}
      >
        <legend className="px-1 text-sm font-bold text-ink">割り方</legend>
        <div className="flex flex-wrap items-center gap-2">
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
          {splitMode === "equal" ? (
            <button
              type="button"
              onClick={() => setSplitOpen(false)}
              aria-expanded
              aria-controls={splitFieldsId}
              className="ml-auto inline-flex min-h-9 items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay"
            >
              割り方を閉じる
            </button>
          ) : null}
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
                ) : null}
              </div>
            );
          })}
        </div>

        {/*
          expenseSchema は「個別金額の合計＝支払い金額」でなければ弾く。
          送信して初めて気づかないよう、同じ差をここに出す。
        */}
        {splitMode === "individual" ? (
          <p
            aria-live="polite"
            className={
              tally.status === "match"
                ? "rounded-control border border-moss/30 bg-mist px-3 py-2 text-sm font-bold text-pine"
                : "rounded-control border border-clay/40 bg-clay/12 px-3 py-2 text-sm font-bold text-clay-ink"
            }
          >
            入力の合計 {formatYenText(tally.entered)} / {formatYenText(tally.total)}
            {tally.status === "match"
              ? "（一致しています）"
              : tally.status === "short"
                ? `（あと ${formatYenText(-tally.difference)} 足りません）`
                : `（${formatYenText(tally.difference)} 多いです）`}
          </p>
        ) : (
          <p className="px-1 text-sm text-muted">
            {share ? `1人あたり ${share.min === share.max ? formatYenText(share.min) : `${formatYenText(share.min)}〜${formatYenText(share.max)}`} × ${share.count}人` : "金額を入力すると1人あたりの負担額を出します。"}
          </p>
        )}
      </fieldset>

      {/*
        URL・重要メモ・メモは入れない支払いのほうが多いので畳んでおく。
        details の中身は閉じていても送信される。既に値が入っているときは開いて出す。
      */}
      <details open={detailsOpen} className="rounded-control border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
          詳細
          <span className="font-normal text-muted">支払い用URL・重要メモ・メモ</span>
          <span aria-hidden="true" className="ml-auto text-muted">
            ▾
          </span>
        </summary>
        <div className="grid gap-4 border-t border-line p-4">
          <TextField label="支払い用URL" name="payment_url" defaultValue={initialValues?.paymentUrl} placeholder="https://..." />
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
        </div>
      </details>

      <SubmitButton className="text-sm" icon={<ReceiptText aria-hidden="true" className="h-4 w-4" />} pendingChildren="保存中…">
        {submitLabel}
      </SubmitButton>
    </MadoiForm>
  );
}
