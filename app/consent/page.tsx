import { LoginConsentForm } from "@/components/login-consent-form";
import { Card, PageHeader } from "@/components/ui";
import { acceptLegalDocumentsAction } from "@/lib/actions/legal";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title="利用を開始する前に" description="Madoi を使うために、利用規約とプライバシーポリシーへの同意をお願いします。" />
      <Card className="max-w-xl">
        <LoginConsentForm action={acceptLegalDocumentsAction} nextPath={safeNextPath(next)} submitLabel="同意して続ける" />
      </Card>
    </div>
  );
}
