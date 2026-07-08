import { Card, PageHeader, SecondaryLink } from "@/components/ui";

export default async function AnswerCompletePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="space-y-6">
      <PageHeader title="回答しました" description="日程回答を保存しました。日程が確定したら、作成者から共有されます。" />
      <Card>
        <p className="text-sm leading-6 text-ink/70">
          この画面は閉じて大丈夫です。回答を直したいときは、同じ共有リンクをもう一度開いてください。
        </p>
        <div className="mt-5">
          <SecondaryLink href={`/s/${token}/settlement`}>支払い・清算を見る</SecondaryLink>
        </div>
      </Card>
    </div>
  );
}
