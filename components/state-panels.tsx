import { Card, ButtonLink } from "@/components/ui";

export function SetupPanel() {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">Supabase設定が必要です</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        `.env.local` にSupabaseのURL、匿名キー、サービスロールキーを設定すると画面を操作できます。
      </p>
    </Card>
  );
}

export function LoginPanel() {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-ink">ログインしてください</h2>
      <p className="mt-2 text-sm leading-6 text-ink/70">予定作成と日程確定にはログインが必要です。</p>
      <div className="mt-4">
        <ButtonLink href="/login">ログインへ</ButtonLink>
      </div>
    </Card>
  );
}
