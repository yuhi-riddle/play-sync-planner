import React from "react";
import { LogOut } from "lucide-react";

import { Card } from "@/components/ui";
import { signOutAction } from "@/lib/actions/account/auth";

export function SignOutCard() {
  return (
    <Card className="max-w-2xl">
      <h2 className="text-title text-ink">ログアウト</h2>
      <p className="mt-1 text-caption text-muted">この端末からログアウトします。次に使うときは、もう一度Googleでログインしてください。</p>
      <form action={signOutAction} className="mt-4">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-body font-bold text-ink transition-colors hover:border-moss hover:text-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          ログアウト
        </button>
      </form>
    </Card>
  );
}
