"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import React from "react";
import { useState } from "react";

/**
 * 同意チェックは保存しない。
 *
 * 事前にチェックが入った状態で見せると、同意を取ったことにならない。
 * かといって規約を読みに行くたびに入力が消えるのも困るので、規約は別タブで開き、
 * この画面から離脱させないことで両立させている。
 */
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      {children}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">（新しいタブで開きます）</span>
    </Link>
  );
}

export function LoginConsentForm({
  action,
  nextPath,
  submitLabel = "Google でログイン"
}: {
  action: (formData: FormData) => void | Promise<void>;
  nextPath: string;
  submitLabel?: string;
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const canSubmit = termsAccepted && privacyAccepted;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-body text-muted">
        2つの内容を確認してから、下のチェックを入れてください。両方に同意するとログインできます。
      </p>
      <div className="space-y-3 rounded-control border border-line bg-sunken p-4 text-body text-ink">
        <div className="flex items-start gap-3">
          <input
            name="termsAccepted"
            type="checkbox"
            aria-label="利用規約に同意する"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 accent-pine"
          />
          <span>
            <LegalLink href="/terms?from=login">利用規約を読む</LegalLink>
            <span className="ml-1">内容を確認し、同意する</span>
          </span>
        </div>
        <div className="flex items-start gap-3">
          <input
            name="privacyAccepted"
            type="checkbox"
            aria-label="プライバシーポリシーに同意する"
            checked={privacyAccepted}
            onChange={(event) => setPrivacyAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 accent-pine"
          />
          <span>
            <LegalLink href="/privacy?from=login">プライバシーポリシーを読む</LegalLink>
            <span className="ml-1">内容を確認し、同意する</span>
          </span>
        </div>
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-subtle"
      >
        {submitLabel}
      </button>
    </form>
  );
}
