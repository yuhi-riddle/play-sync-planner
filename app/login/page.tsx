import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Card, PageHeader, SubmitButton } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signInWithGoogle(formData: FormData) {
  "use server";

  const nextPath = safeNextPath(formData.get("next")?.toString());
  const cookieStore = await cookies();
  cookieStore.set("madoi_login_next", nextPath, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });

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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);

  return (
    <div className="space-y-6">
      <PageHeader title="ログイン" description="Madoi の利用には Google ログインが必要です。" />
      <Card className="max-w-xl">
        {hasSupabaseEnv() ? (
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={nextPath} />
            <SubmitButton>Google でログイン</SubmitButton>
          </form>
        ) : (
          <p className="text-sm leading-6 text-ink/70">
            Supabase の環境変数が未設定です。`.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定してください。
          </p>
        )}
      </Card>
    </div>
  );
}
