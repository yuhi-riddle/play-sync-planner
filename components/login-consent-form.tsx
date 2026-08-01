"use client";

import React, { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

import { LegalModal } from "@/components/legal-modal";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal-documents";

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

function ConsentRow({
  name,
  label,
  linkLabel,
  onOpen,
  buttonRef,
  accepted,
  onAcceptedChange,
  opened
}: {
  name: string;
  label: string;
  linkLabel: string;
  onOpen: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  opened: boolean;
}) {
  return (
    <div className="grid gap-2">
      <span className={clsx(!opened && "text-muted")}>
        <button
          ref={buttonRef}
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 items-center gap-1 font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          {linkLabel}
        </button>
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

type OpenDocument = "terms" | "privacy" | null;

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
  const [openDocument, setOpenDocument] = useState<OpenDocument>(null);
  const termsButtonRef = useRef<HTMLButtonElement>(null);
  const privacyButtonRef = useRef<HTMLButtonElement>(null);
  const lastOpenedRef = useRef<OpenDocument>(null);

  // モーダルを閉じたら、開くきっかけになったボタンへフォーカスを戻す。
  useEffect(() => {
    if (openDocument) {
      lastOpenedRef.current = openDocument;
      return;
    }

    if (!lastOpenedRef.current) {
      return;
    }

    const target = lastOpenedRef.current === "terms" ? termsButtonRef : privacyButtonRef;
    target.current?.focus();
    lastOpenedRef.current = null;
  }, [openDocument]);

  const updateDraft = (patch: Partial<ConsentDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const canSubmit = draft.termsAccepted && draft.privacyAccepted;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-body text-muted">
        利用規約とプライバシーポリシーの両方に同意すると、Googleログインへ進めます。
      </p>
      <div className="space-y-3 rounded-control border border-line bg-sunken p-4 text-body text-ink">
        <ConsentRow
          name="termsAccepted"
          label="利用規約に同意する"
          linkLabel="利用規約を読む"
          buttonRef={termsButtonRef}
          onOpen={() => {
            updateDraft({ termsOpened: true });
            setOpenDocument("terms");
          }}
          accepted={draft.termsAccepted}
          onAcceptedChange={(accepted) => updateDraft({ termsAccepted: accepted })}
          opened={draft.termsOpened}
        />
        <ConsentRow
          name="privacyAccepted"
          label="プライバシーポリシーに同意する"
          linkLabel="プライバシーポリシーを読む"
          buttonRef={privacyButtonRef}
          onOpen={() => {
            updateDraft({ privacyOpened: true });
            setOpenDocument("privacy");
          }}
          accepted={draft.privacyAccepted}
          onAcceptedChange={(accepted) => updateDraft({ privacyAccepted: accepted })}
          opened={draft.privacyOpened}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-subtle"
      >
        {submitLabel}
      </button>

      {openDocument === "terms" ? (
        <LegalModal
          title="利用規約"
          sections={TERMS_SECTIONS}
          pageHref="/terms"
          onClose={() => setOpenDocument(null)}
        />
      ) : null}

      {openDocument === "privacy" ? (
        <LegalModal
          title="プライバシーポリシー"
          sections={PRIVACY_SECTIONS}
          pageHref="/privacy"
          onClose={() => setOpenDocument(null)}
        />
      ) : null}
    </form>
  );
}
