"use client";

import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import React from "react";
import { useId, useState } from "react";
import { clsx } from "clsx";

/**
 * 同意チェックは保存しない。
 *
 * 事前にチェックが入った状態で見せると、同意を取ったことにならない。
 * かといって規約を読みに行くたびに入力が消えるのも困るので、規約は別タブで開き、
 * この画面から離脱させないことで両立させている。
 *
 * さらに、開いてもいない書面への同意もまた同意とは言えないので、
 * リンクを開くまでチェックボックスは操作できない。
 */
function ConsentRow({
  name,
  label,
  linkLabel,
  href,
  accepted,
  onAcceptedChange
}: {
  name: string;
  label: string;
  linkLabel: string;
  href: string;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const hintId = useId();
  const [opened, setOpened] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <input
        name={name}
        type="checkbox"
        aria-label={label}
        aria-describedby={opened ? undefined : hintId}
        checked={accepted}
        disabled={!opened}
        onChange={(event) => onAcceptedChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-pine disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className={clsx(!opened && "text-muted")}>
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpened(true)}
          className="inline-flex items-center gap-1 font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          {linkLabel}
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">（新しいタブで開きます）</span>
        </Link>
        <span className="ml-1">内容を確認し、同意する</span>
        {opened ? (
          <span className="ml-2 inline-flex items-center gap-1 text-caption font-bold text-pine">
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            開きました
          </span>
        ) : (
          <span id={hintId} className="ml-2 text-caption text-muted">
            先にリンクを開くとチェックできます
          </span>
        )}
      </span>
    </div>
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
        2つの書面を開いて内容を確認すると、チェックを入れられます。両方に同意するとログインできます。
      </p>
      <div className="space-y-3 rounded-control border border-line bg-sunken p-4 text-body text-ink">
        <ConsentRow
          name="termsAccepted"
          label="利用規約に同意する"
          linkLabel="利用規約を読む"
          href="/terms?from=login"
          accepted={termsAccepted}
          onAcceptedChange={setTermsAccepted}
        />
        <ConsentRow
          name="privacyAccepted"
          label="プライバシーポリシーに同意する"
          linkLabel="プライバシーポリシーを読む"
          href="/privacy?from=login"
          accepted={privacyAccepted}
          onAcceptedChange={setPrivacyAccepted}
        />
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
