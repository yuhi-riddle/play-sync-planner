"use client";

import { Trash2 } from "lucide-react";
import React, { useActionState, useEffect, useRef, useState } from "react";

import type { ActionState } from "@/lib/domain/shared/action-state";

/**
 * 参加者を1人外すボタン。
 *
 * 断られる理由（立替が残っている等）を画面に出す必要があるので、
 * <form action={...}> の直呼びではなく useActionState で受け取る。
 * Server Action の throw は本番だと汎用文言に差し替わるため。
 *
 * ボタンと結果は、行の flex-wrap の子として並ぶ。確認パネルと結果は
 * basis-full で次の行に落として、名前とバッジを押し出さないようにする。
 */
export function ParticipantDeleteButton({
  action,
  displayName
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  displayName: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ActionState);
  const [confirming, setConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // ゴミ箱ボタンと入れ替わるので、開いたらフォーカスも移す。
  // 移さないと body に落ちて、キーボードだけの人が確認文にたどり着けない。
  useEffect(() => {
    if (confirming) {
      confirmButtonRef.current?.focus();
    }
  }, [confirming]);

  /*
   * 結果が返ったら確認パネルは畳む。消せたときは行ごと消えるが、
   * 断られたときにパネルが残ると「外しますか？」と断り文が同時に出て読めない。
   * useActionState は実行のたび別オブジェクトを返すので、これで拾える。
   */
  useEffect(() => {
    if (state.status !== "idle") {
      setConfirming(false);
    }
  }, [state]);

  if (confirming) {
    return (
      <div className="basis-full rounded-control border border-clay/25 bg-clay/10 p-3" aria-live="polite">
        <p className="text-body font-bold text-ink">{displayName}さんを参加者から外しますか？</p>
        {/* 回答は availability_answers の削除連鎖で一緒に消える。戻せないことは先に言う。 */}
        <p className="mt-1 text-caption leading-5 text-muted">この人の回答も一緒に消えます。元に戻せません。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={formAction}>
            <button
              ref={confirmButtonRef}
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 py-2 text-body font-bold text-white focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "外しています…" : "外す"}
            </button>
          </form>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-body font-bold text-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            やめる
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        // 行が全部「削除」で同じ見た目になるので、進行表と同じく aria-label で誰かを言う。
        aria-label={`${displayName}を参加者から削除`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
      </button>

      {state.status === "error" && state.message ? (
        <p role="alert" className="basis-full text-caption leading-5 text-clay-ink">
          {state.message}
        </p>
      ) : null}
    </>
  );
}
