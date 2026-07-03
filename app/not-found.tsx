import { ButtonLink, Card, PageHeader } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader title="ページが見つかりません" description="リンクが間違っているか、ページが削除された可能性があります。" />
      <Card className="max-w-xl">
        <p className="text-sm leading-6 text-ink/68">
          共有リンクを開いた場合は、送ってくれた人にもう一度リンクを確認してもらってください。
        </p>
        <div className="mt-5">
          <ButtonLink href="/">ホームへ</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
