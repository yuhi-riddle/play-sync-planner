"use client";

import { TriangleAlert } from "lucide-react";
import React, { useActionState } from "react";

import { Alert, Card } from "@/components/ui";
import { withdrawAccountAction } from "@/lib/actions/account";
import { ACCOUNT_ACTION_INITIAL_STATE, type AccountActionState } from "@/lib/domain/account/account";

type WithdrawAction = (state: AccountActionState, formData: FormData) => Promise<AccountActionState>;

export function WithdrawAccountCard({
  nickname,
  unpaidSettlementCount,
  action = withdrawAccountAction
}: {
  nickname: string;
  unpaidSettlementCount: number;
  action?: WithdrawAction;
}) {
  const [state, formAction, isPending] = useActionState(action, ACCOUNT_ACTION_INITIAL_STATE);

  return (
    <Card className="max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-clay/12 text-clay-ink">
          <TriangleAlert aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-title text-ink">退会する</h2>
          <p className="mt-1 text-caption text-muted">退会すると元に戻せません。取り消せませんので、よく確認してください。</p>
        </div>
      </div>

      <div className="mt-5 space-y-4 text-body text-ink">
        <div>
          <h3 className="text-body font-bold text-ink">消えるもの</h3>
          <p className="mt-1 text-caption text-muted">
            つながり(フォロー・お気に入り・ブロック)、通知、イベントの下書き、Google Calendar連携、プロフィール画像とニックネーム。
          </p>
        </div>
        <div>
          <h3 className="text-body font-bold text-ink">残るもの</h3>
          <p className="mt-1 text-caption text-muted">
            イベントと清算の記録は残ります。一緒に参加した人の記録を壊さないためです。あなたの表示名は「退会したユーザー」に変わりますが、
            清算の相手が分からなくなるのを避けるため、日程調整の参加者名はそのまま残ります。
          </p>
        </div>
      </div>

      {unpaidSettlementCount > 0 ? (
        <div className="mt-5">
          <Alert tone="warn" title="清算がまだ終わっていません">
            未完了の清算が{unpaidSettlementCount}件あります。退会するとあなたから操作できなくなるので、先に済ませることをおすすめします。
          </Alert>
        </div>
      ) : null}

      {state.status === "error" && state.message ? (
        <div className="mt-5">
          <Alert tone="error" title="退会できませんでした" assertive>
            {state.message}
          </Alert>
        </div>
      ) : null}

      <form action={formAction} className="mt-5 space-y-4">
        <label className="block text-body font-medium text-ink">
          <span className="text-muted">確認のため、表示名「{nickname}」を入力してください</span>
          <input
            className="mt-2 min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-clay focus:ring-2 focus:ring-clay/20"
            name="confirmation"
            type="text"
            required
            autoComplete="off"
            placeholder={nickname}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-clay-ink/85 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "退会処理中…" : "退会する"}
        </button>
      </form>
    </Card>
  );
}
