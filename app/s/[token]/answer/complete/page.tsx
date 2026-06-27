import { Card, PageHeader } from "@/components/ui";

export default function AnswerCompletePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="回答しました" description="日程回答を保存しました。予定が確定したら、作成者から共有されます。" />
      <Card>
        <p className="text-sm leading-6 text-ink/70">
          この画面は閉じて大丈夫です。回答を直したいときは、同じ共有リンクをもう一度開いてください。
        </p>
      </Card>
    </div>
  );
}
