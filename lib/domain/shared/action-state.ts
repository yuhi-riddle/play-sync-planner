/**
 * Server Action が `useActionState` へ返す共通の型。
 *
 * Next.js は本番ビルドで Server Action 内の未処理例外のメッセージをクライアントに渡さない
 * (digest付きの汎用文言に差し替わる)。日本語のエラーメッセージをユーザーに届けるには、
 * throw するのではなく、この型で明示的に返す必要がある。
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export function errorState(message: string, fieldErrors?: Record<string, string>): ActionState {
  return fieldErrors ? { status: "error", message, fieldErrors } : { status: "error", message };
}

export function successState(message?: string): ActionState {
  return { status: "success", message };
}

/**
 * Supabaseなどの生エラーをそのままユーザーに見せない。
 * 原因は console.error に残し、ユーザーには日本語の定型文だけ返す。
 */
export function failWith(userMessage: string, cause: unknown): ActionState {
  console.error(userMessage, cause);
  return errorState(userMessage);
}
