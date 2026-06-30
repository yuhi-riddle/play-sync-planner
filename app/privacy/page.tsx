import { Card, PageHeader } from "@/components/ui";

const sections = [
  {
    title: "1. 取得する情報",
    body:
      "Madoi は、ログインに必要なユーザーID、メールアドレス、表示名、イベント情報、候補日時、回答内容、コメント、共有リンクに関する情報を扱います。"
  },
  {
    title: "2. 利用目的",
    body:
      "取得した情報は、ログイン、予定の作成、候補日時の管理、共有リンクによる回答、回答状況の表示、サービスの保守、不正利用の防止に使います。"
  },
  {
    title: "3. Google ユーザーデータ",
    body:
      "Googleログインで取得する情報は、本人確認とアカウント表示のために使います。Google Calendar連携を有効にした場合は、候補日時を作るときに予定の重なりを確認するため、予定の開始・終了時刻、予定名、場所を取得します。また、日程を確定したときに、確定した予定をGoogle Calendarへ作成します。予定の説明、参加者、Meet URL、添付ファイルなどは取得しません。Google Calendarの予定詳細はデータベースに保存せず、画面表示と予定作成のためだけに使います。連携用トークンは暗号化して保存し、連携解除時に削除します。"
  },
  {
    title: "4. 共有リンク",
    body:
      "共有リンクを知っている人は、ログインせずに日程回答できる場合があります。共有リンクを受け取った人には、イベント名、候補日時、回答フォームが表示されます。"
  },
  {
    title: "5. 第三者提供",
    body:
      "法令に基づく場合、利用者の同意がある場合、サービス提供に必要な外部サービスを使う場合を除き、個人情報を第三者へ販売または提供しません。"
  },
  {
    title: "6. 外部サービス",
    body:
      "Madoi は、認証やデータ保存のために Supabase、Googleログイン、Google Calendar などの外部サービスを使います。各サービスでは、それぞれの規約やプライバシーポリシーが適用されます。"
  },
  {
    title: "7. 保管期間と削除",
    body:
      "予定や回答データは、サービス提供に必要な期間保管します。削除機能や問い合わせ対応は、正式公開前に整備します。"
  },
  {
    title: "8. 安全管理",
    body:
      "通信の保護、アクセス制御、認証情報の秘匿など、合理的な安全管理措置を行います。"
  },
  {
    title: "9. 問い合わせ",
    body:
      "問い合わせ先は正式公開前に設定します。公開開始時には、連絡先メールアドレスまたは問い合わせフォームをこのページに掲載します。"
  }
];

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="プライバシーポリシー" description="Madoi で扱う情報と、その使い方です。" />
      <Card>
        <p className="text-sm leading-7 text-ink/64">
          このページはドラフトです。正式公開前に、実際に取得する情報、運営者情報、問い合わせ先を確認してください。
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
