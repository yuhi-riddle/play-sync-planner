"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";

const TERMS_STORAGE_KEY = "madoi-login-terms-accepted";
const PRIVACY_STORAGE_KEY = "madoi-login-privacy-accepted";

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

  useEffect(() => {
    setTermsAccepted(window.sessionStorage.getItem(TERMS_STORAGE_KEY) === "true");
    setPrivacyAccepted(window.sessionStorage.getItem(PRIVACY_STORAGE_KEY) === "true");
  }, []);

  function updateTermsAccepted(checked: boolean) {
    setTermsAccepted(checked);
    window.sessionStorage.setItem(TERMS_STORAGE_KEY, String(checked));
  }

  function updatePrivacyAccepted(checked: boolean) {
    setPrivacyAccepted(checked);
    window.sessionStorage.setItem(PRIVACY_STORAGE_KEY, String(checked));
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-sm leading-6 text-ink/68">
        2つの内容を確認してから、下のチェックを入れてください。両方に同意するとログインできます。
      </p>
      <div className="space-y-3 rounded-lg border border-moss/18 bg-white/60 p-4 text-sm text-ink">
        <div className="flex items-start gap-3">
          <input
            name="termsAccepted"
            type="checkbox"
            aria-label="利用規約に同意する"
            checked={termsAccepted}
            onChange={(event) => updateTermsAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 accent-pine"
          />
          <span>
            <Link href="/terms?from=login" className="font-bold text-pine underline underline-offset-4">
              利用規約を読む
            </Link>
            <span className="ml-1">内容を確認し、同意する</span>
          </span>
        </div>
        <div className="flex items-start gap-3">
          <input
            name="privacyAccepted"
            type="checkbox"
            aria-label="プライバシーポリシーに同意する"
            checked={privacyAccepted}
            onChange={(event) => updatePrivacyAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 accent-pine"
          />
          <span>
            <Link href="/privacy?from=login" className="font-bold text-pine underline underline-offset-4">
              プライバシーポリシーを読む
            </Link>
            <span className="ml-1">内容を確認し、同意する</span>
          </span>
        </div>
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-sm font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-ink/35"
      >
        {submitLabel}
      </button>
    </form>
  );
}
