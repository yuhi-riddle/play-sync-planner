import { Card, PageHeader } from "@/components/ui";

const sections = [
  {
    title: "1. 取得する情報",
    body: "Madoi は、Google ログインで取得するユーザーID、メールアドレス、表示名、予定名、カテゴリ、場所メモ、候補日時、回答内容、コメント、共有リンクに関する情報を扱います。"
  },
  {
    title: "2. 利用目的",
    body: "取得した情報は、ログイン、予定の作成、日程候補の管理、共有リンクによる回答、回答状況の表示、サービスの保守、不正利用の防止のために使います。"
  },
  {
    title: "3. Google ユーザーデータ",
    body: "Google ログインで取得する情報は、本人確認とアカウント表示のために使います。将来 Google Calendar 連携を追加する場合は、必要な権限だけを求め、取得・利用・保存する情報をこのページで明示します。"
  },
  {
    title: "4. 共有リンク",
    body: "共有リンクを知っている人は、ログインせずに日程回答できる場合があります。共有リンクを受け取った人には、予定名、候補日時、回答フォームが表示されます。"
  },
  {
    title: "5. 第三者提供",
    body: "法令に基づく場合、利用者の同意がある場合、サービスの提供に必要な外部サービスを使う場合を除き、個人情報を第三者へ販売・提供しません。"
  },
  {
    title: "6. 外部サービス",
    body: "Madoi は、認証やデータ保存のために Supabase、Google ログインなどの外部サービスを使います。各サービスでは、それぞれの規約やプライバシーポリシーが適用されます。"
  },
  {
    title: "7. 保管期間と削除",
    body: "予定や回答データは、サービス提供に必要な期間保管します。削除機能や問い合わせ窓口は正式公開前に整備します。"
  },
  {
    title: "8. 安全管理",
    body: "通信の保護、アクセス制御、認証情報の秘匿など、合理的な安全管理措置を行います。"
  },
  {
    title: "9. お問い合わせ",
    body: "問い合わせ先は正式公開前に設定します。運用開始時には、連絡先メールアドレスまたは問い合わせフォームをこのページに掲載します。"
  }
];

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="プライバシーポリシー" description="Madoi で扱う情報と、その使い方です。" />
      <Card>
        <p className="text-sm leading-7 text-ink/64">
          このページはドラフトです。正式公開前に、実際に取得する情報、運営者情報、問い合わせ先を必ず確認してください。
        </p>
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-ink/68">{section.body}</p>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
