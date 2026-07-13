import React from "react";

import { Card } from "@/components/ui";

export function AccountEmailCard({ email }: { email?: string | null }) {
  return (
    <Card>
      <p className="text-sm text-muted">Googleログインのメールアドレス</p>
      <p className="mt-1 font-semibold text-ink">{email ?? "メールアドレスを取得できませんでした"}</p>
      <p className="mt-3 text-sm leading-6 text-muted">
        別のメールアドレスを使う場合は、一度ログアウトして別のGoogleアカウントでログインしてください。
      </p>
    </Card>
  );
}
