"use client";

import { Trash2 } from "lucide-react";
import React, { useActionState } from "react";

import type { ActionState } from "@/lib/domain/action-state";

/**
 * 参加者を1人外すボタン。
 *
 * 断られる理由（立替が残っている等）を画面に出す必要があるので、
 * <form action={...}> の直呼びではなく useActionState で受け取る。
 * Server Action の throw は本番だと汎用文言に差し替わるため。
 *
 * ボタンと結果は、行の flex-wrap の子として並ぶ。結果は basis-full で
 * 次の行に落として、名前とバッジを押し出さないようにする。
 */
export function ParticipantDeleteButton({
  action,
  displayName
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  displayName: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ActionState);

  return (
    <>
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          // 行が全部「削除」で同じ見た目になるので、進行表と同じく aria-label で誰かを言う。
          aria-label={`${displayName}を参加者から削除`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:border-clay hover:text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:opacity-50"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      {state.status === "error" && state.message ? (
        <p role="alert" className="basis-full text-caption leading-5 text-clay-ink">
          {state.message}
        </p>
      ) : null}
    </>
  );
}
