"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const { error } = await supabase.from("user_consents").upsert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    agreed_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(formData.get("next")?.toString()));
}
