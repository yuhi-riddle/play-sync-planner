export const LEGAL_CONSENT_METADATA_KEY = "legal_consent_accepted_at";

/**
 * 同意済みの印が app_metadata にあるか。
 * middleware が user_consents を引かずに同意ゲートを通すために使う。
 * app_metadata は service role でしか書けないので、本人が印を偽装できない。
 */
export function hasLegalConsentMark(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") {
    return false;
  }

  const acceptedAt = (appMetadata as Record<string, unknown>)[LEGAL_CONSENT_METADATA_KEY];
  return typeof acceptedAt === "string" && acceptedAt.length > 0;
}
