/**
 * ログイン後にGoogleから戻ってくる先のオリジンを決める。
 *
 * ログインを始めたサイトに戻さないと、そのサイトのCookieに入った確認用の値と
 * 突き合わせられずログインが完了しない（プレビューで始めて本番に戻る、など）。
 * ただし Host ヘッダーは書き換えられるので、戻してよいのは次だけにする。
 * それ以外は、設定済みの本番URLに戻す。
 * - 本番（NEXT_PUBLIC_SITE_URL）
 * - このプロジェクトの Vercel プレビュー
 * - ローカル開発（localhost）
 */
const PREVIEW_ORIGIN = /^https:\/\/play-sync-planner-[a-z0-9-]+-yuhi-riddles-projects\.vercel\.app$/;
const LOCAL_ORIGIN = /^http:\/\/localhost:\d{1,5}$/;

export function resolveAuthRedirectOrigin(requestOrigin: string | null, siteUrl: string): string {
  const site = siteUrl.replace(/\/+$/, "");

  if (!requestOrigin) return site;
  if (requestOrigin === site || PREVIEW_ORIGIN.test(requestOrigin) || LOCAL_ORIGIN.test(requestOrigin)) {
    return requestOrigin;
  }
  return site;
}
