import React from "react";
import { Card, PageHeader, SecondaryLink } from "@/components/ui";
import { LegalDocumentBody } from "@/components/legal-document-body";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { LEGAL_EFFECTIVE_DATE, TERMS_SECTIONS } from "@/lib/legal-documents";

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ from?: string; next?: string }> }) {
  const { from, next } = await searchParams;
  const nextPath = safeNextPath(next);
  const returnHref = from === "login" ? `/login?next=${encodeURIComponent(nextPath)}` : "/";

  return (
    <div className="space-y-6">
      <PageHeader
        title="利用規約"
        description="Madoi を使うときの基本ルールです。"
        action={<SecondaryLink href={returnHref}>{from === "login" ? "ログインへ戻る" : "ホームへ戻る"}</SecondaryLink>}
      />
      <Card>
        <p className="text-sm leading-7 text-muted">施行日: {LEGAL_EFFECTIVE_DATE}</p>
        <div className="mt-6">
          <LegalDocumentBody sections={TERMS_SECTIONS} />
        </div>
      </Card>
    </div>
  );
}
