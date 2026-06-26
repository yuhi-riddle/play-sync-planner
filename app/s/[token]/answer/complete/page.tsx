import { PageHeader, Card, ButtonLink } from "@/components/ui";

export default function AnswerCompletePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="回答しました" description="日程回答を保存しました。" />
      <Card>
        <ButtonLink href="/">ホームへ</ButtonLink>
      </Card>
    </div>
  );
}
