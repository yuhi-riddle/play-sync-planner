"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { hasAcceptedLegalDocuments, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function acceptLegalDocumentsAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!hasAcceptedLegalDocuments(formData)) {
    throw new Error("利用規約とプライバシーポリシーへの同意が必要です。");
  }

  const supabase = await createSupabaseServerClient();
  const agreedAt = new Date().toISOString();
  const { error } = await supabase.from("user_consents").upsert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    agreed_at: agreedAt
  });

  if (error) {
    throw new Error(error.message);
  }

  // 正本を保存できたあとに印を書く。順序が逆だと、記録が無いのにゲートだけ通る状態が生まれる。
  await markLegalConsentAccepted(user.id, agreedAt);

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")?.toString()));
}
