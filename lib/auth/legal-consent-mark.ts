import { LEGAL_CONSENT_METADATA_KEY } from "@/lib/domain/legal-consent";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 同意済みの印を app_metadata に書く。
 * 記録の正本は user_consents テーブルのままで、これは middleware を1往復で済ませるための印。
 * app_metadata に渡したキーはマージされるので、provider などSupabaseが持つ値は消えない。
 */
export async function markLegalConsentAccepted(userId: string, acceptedAt: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [LEGAL_CONSENT_METADATA_KEY]: acceptedAt }
  });

  if (error) {
    throw new Error(error.message);
  }
}
