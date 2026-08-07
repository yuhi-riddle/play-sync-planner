import React from "react";
import { Card, PageHeader, SecondaryLink } from "@/components/ui";
import { LegalDocumentBody } from "@/components/legal/legal-document-body";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_SECTIONS } from "@/lib/domain/account/legal-documents";

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ from?: string; next?: string }> }) {
  const { from, next } = await searchParams;
  const nextPath = safeNextPath(next);
  const returnHref = from === "login" ? `/login?next=${encodeURIComponent(nextPath)}` : "/";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Legal"
        title="プライバシーポリシー"
        description="Madoi で扱う情報と、その使い方です。"
        action={<SecondaryLink href={returnHref}>{from === "login" ? "ログインへ戻る" : "ホームへ戻る"}</SecondaryLink>}
      />
      <Card>
        <p className="text-sm leading-7 text-muted">施行日: {LEGAL_EFFECTIVE_DATE}</p>
        <div className="mt-6">
          <LegalDocumentBody sections={PRIVACY_SECTIONS} />
        </div>
      </Card>
    </div>
  );
}
