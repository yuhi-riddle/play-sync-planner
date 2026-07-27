import Link from "next/link";

import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { PageHeader } from "@/components/ui";
import { WithdrawAccountCard } from "@/components/withdraw-account-card";
import { getUserDisplayName } from "@/lib/domain/profile";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false }
};

export default async function WithdrawPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="退会" />
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
        <PageHeader title="退会" />
        <LoginPanel />
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: myParticipants } = await supabase.from("participants").select("id").eq("user_id", user.id);
  const participantIds = (myParticipants ?? []).map((participant) => participant.id);

  let unpaidSettlementCount = 0;
  if (participantIds.length > 0) {
    const { count } = await supabase
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .eq("status", "unpaid")
      .or(
        `from_participant_id.in.(${participantIds.join(",")}),to_participant_id.in.(${participantIds.join(",")})`
      );
    unpaidSettlementCount = count ?? 0;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="退会"
        description="Madoiの利用をやめる場合の手続きです。内容を確認してから進めてください。"
      />
      <WithdrawAccountCard
        nickname={profile?.nickname ?? getUserDisplayName(user, "Madoiユーザー")}
        unpaidSettlementCount={unpaidSettlementCount}
      />
      <p className="text-caption text-muted">
        <Link href="/settings" className="font-semibold underline hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay">
          設定に戻る
        </Link>
      </p>
    </div>
  );
}
