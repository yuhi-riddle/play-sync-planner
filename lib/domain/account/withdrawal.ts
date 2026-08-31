export const WITHDRAWAL_METADATA_KEY = "withdrawn_at";

/**
 * 退会済みの印が app_metadata にあるか。
 * app_metadata は service role でしか書けないので、本人が印を偽装できない。
 */
export function isWithdrawn(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }

  const withdrawnAt = (appMetadata as Record<string, unknown>)[WITHDRAWAL_METADATA_KEY];
  return typeof withdrawnAt === "string" && withdrawnAt.length > 0;
}
