"use client";

import Link from "next/link";
import React from "react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

const CONSENT_DRAFT_KEY = "madoi-login-consent";

type ConsentDraft = {
  termsOpened: boolean;
  privacyOpened: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

const emptyConsentDraft: ConsentDraft = {
  termsOpened: false,
  privacyOpened: false,
  termsAccepted: false,
  privacyAccepted: false
};

/** 規約ページから戻るまで、閲覧済み・チェック済みの状態を同じタブ内に保持する。 */
function ConsentRow({
  name,
  label,
  linkLabel,
  href,
  accepted,
  onAcceptedChange,
  opened,
  onOpened
}: {
  name: string;
  label: string;
  linkLabel: string;
  href: string;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  opened: boolean;
  onOpened: () => void;
}) {
  return (
    <div className="grid gap-2">
      <span className={clsx(!opened && "text-muted")}>
        <Link
          href={href}
          onClick={onOpened}
          onAuxClick={onOpened}
          onContextMenu={onOpened}
          className="inline-flex min-h-11 items-center gap-1 font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          {linkLabel}
        </Link>
      </span>
      <label
        className={clsx(
          "flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-body font-medium text-ink",
          !opened && "cursor-not-allowed text-muted opacity-60"
        )}
      >
        <input
          name={name}
          type="checkbox"
          aria-label={label}
          checked={accepted}
          disabled={!opened}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-pine disabled:cursor-not-allowed"
        />
        <span>{label}</span>
      </label>
      <span aria-live="polite" className="sr-only">
        {opened ? label + "のチェックができるようになりました" : ""}
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
  const [draft, setDraft] = useState(emptyConsentDraft);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(CONSENT_DRAFT_KEY);
    if (!stored) return;

    try {
      setDraft({ ...emptyConsentDraft, ...(JSON.parse(stored) as Partial<ConsentDraft>) });
    } catch {
      window.sessionStorage.removeItem(CONSENT_DRAFT_KEY);
    }
  }, []);

  const updateDraft = (patch: Partial<ConsentDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      window.sessionStorage.setItem(CONSENT_DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const canSubmit = draft.termsAccepted && draft.privacyAccepted;
  const encodedNextPath = encodeURIComponent(nextPath);

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={() => window.sessionStorage.removeItem(CONSENT_DRAFT_KEY)}
    >
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-body text-muted">
        利用規約とプライバシーポリシーの両方に同意すると、Googleログインへ進めます。
      </p>
      <div className="space-y-3 rounded-control border border-line bg-sunken p-4 text-body text-ink">
        <ConsentRow
          name="termsAccepted"
          label="利用規約に同意する"
          linkLabel="利用規約を読む"
          href={`/terms?from=login&next=${encodedNextPath}`}
          accepted={draft.termsAccepted}
          onAcceptedChange={(accepted) => updateDraft({ termsAccepted: accepted })}
          opened={draft.termsOpened}
          onOpened={() => updateDraft({ termsOpened: true })}
        />
        <ConsentRow
          name="privacyAccepted"
          label="プライバシーポリシーに同意する"
          linkLabel="プライバシーポリシーを読む"
          href={`/privacy?from=login&next=${encodedNextPath}`}
          accepted={draft.privacyAccepted}
          onAcceptedChange={(accepted) => updateDraft({ privacyAccepted: accepted })}
          opened={draft.privacyOpened}
          onOpened={() => updateDraft({ privacyOpened: true })}
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
