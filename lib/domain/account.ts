/**
 * 退会後に残る記録（イベント・清算）で使う表示名。
 * profiles_nickname_check の1〜40文字に収まる必要がある。
 */
export const WITHDRAWN_DISPLAY_NAME = "退会したユーザー";

export type AccountActionState = {
  status: "idle" | "error";
  message?: string;
};

export const ACCOUNT_ACTION_INITIAL_STATE: AccountActionState = { status: "idle" };

/**
 * 退会は取り消せないので、表示名をそのまま入力してもらって確認とする。
 * 表示名が空のアカウントを素通りさせないよう、空入力は常に未確認扱いにする。
 */
export function isWithdrawalConfirmed(input: string | null, nickname: string): boolean {
  const typed = (input ?? "").trim();
  const expected = nickname.trim();

  if (typed.length === 0 || expected.length === 0) {
    return false;
  }

  return typed === expected;
}

/** 退会済みのユーザーはログインさせない。 */
export function isWithdrawnUserMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const withdrawnAt = (metadata as { withdrawn_at?: unknown }).withdrawn_at;
  return typeof withdrawnAt === "string" && withdrawnAt.length > 0;
}
