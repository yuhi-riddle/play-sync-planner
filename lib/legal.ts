export const TERMS_VERSION = "2026-07-10";
export const PRIVACY_VERSION = "2026-07-10";

export const PENDING_CONSENT_COOKIE = "madoi_pending_legal_consent";

export function hasAcceptedLegalDocuments(formData: FormData) {
  return formData.get("termsAccepted") === "on" && formData.get("privacyAccepted") === "on";
}
