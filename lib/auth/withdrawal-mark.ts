import { WITHDRAWAL_METADATA_KEY } from "@/lib/domain/account/withdrawal";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 退会済みの印を app_metadata に書く。
 * 正本は profiles.deleted_at。これは middleware / Server Action を1往復で済ませるための印。
 */
export async function markAccountWithdrawn(userId: string, withdrawnAt: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { [WITHDRAWAL_METADATA_KEY]: withdrawnAt }
  });

  if (error) {
    throw new Error(error.message);
  }
}
