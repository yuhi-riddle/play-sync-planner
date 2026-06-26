import { PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="設定" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="設定" />
        <LoginPanel />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="設定" description="Phase 1ではログイン情報の確認だけを置いています。" />
      <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="text-sm text-ink/60">メールアドレス</p>
        <p className="mt-1 font-semibold text-ink">{user.email}</p>
      </div>
    </div>
  );
}
