import { createSupabaseAdminClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GoogleTokenStoreError extends Error {
  constructor() {
    super("Google Calendar 連携を保存できませんでした。");
    this.name = "GoogleTokenStoreError";
  }
}

function requireUserId(userId: string) {
  if (!uuidPattern.test(userId)) throw new GoogleTokenStoreError();
}

function requireEncryptedToken(value: string) {
  if (value.length === 0 || value.length > 16_384) throw new GoogleTokenStoreError();
}

function requireOptionalText(value: string | null, maxLength: number) {
  if (value !== null && value.length > maxLength) throw new GoogleTokenStoreError();
}

export async function storeGoogleCalendarIntegration(input: {
  userId: string;
  accountEmail: string | null;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenExpiresAt: string | null;
  scope: string | null;
}): Promise<void> {
  requireUserId(input.userId);
  requireEncryptedToken(input.encryptedAccessToken);
  requireEncryptedToken(input.encryptedRefreshToken);
  requireOptionalText(input.accountEmail, 320);
  requireOptionalText(input.scope, 2_048);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("calendar_integrations").upsert(
    {
      user_id: input.userId,
      provider: "google",
      calendar_id: "primary",
      account_email: input.accountEmail,
      encrypted_access_token: input.encryptedAccessToken,
      encrypted_refresh_token: input.encryptedRefreshToken,
      token_expires_at: input.tokenExpiresAt,
      scope: input.scope
    },
    { onConflict: "user_id,provider" }
  );
  if (error) throw new GoogleTokenStoreError();
}

export async function storeRefreshedGoogleCalendarToken(input: {
  userId: string;
  encryptedAccessToken: string;
  tokenExpiresAt: string | null;
  scope: string | null;
}): Promise<void> {
  requireUserId(input.userId);
  requireEncryptedToken(input.encryptedAccessToken);
  requireOptionalText(input.scope, 2_048);
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("calendar_integrations")
    .update({
      encrypted_access_token: input.encryptedAccessToken,
      token_expires_at: input.tokenExpiresAt,
      scope: input.scope
    })
    .eq("user_id", input.userId)
    .eq("provider", "google");
  if (error) throw new GoogleTokenStoreError();
}
