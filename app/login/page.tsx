import { redirect } from "next/navigation";

import { Card, PageHeader, SubmitButton } from "@/components/ui";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signInWithGoogle() {
  "use server";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="ログイン" description="イベント作成と日程確定にはログインが必要です。共有リンクの回答は未ログインでも使えます。" />
      <Card className="max-w-xl">
        {hasSupabaseEnv() ? (
          <form action={signInWithGoogle}>
            <SubmitButton>Googleでログイン</SubmitButton>
          </form>
        ) : (
          <p className="text-sm leading-6 text-ink/70">
            Supabaseの環境変数が未設定です。`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と
            `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してください。
          </p>
        )}
      </Card>
    </div>
  );
}
