import { Card, PageHeader } from "@/components/ui";

const sections = [
  {
    title: "1. この規約について",
    body: "この利用規約は、Madoi を使うときの基本的なルールを定めるものです。Madoi は、遊びや公演などの日程調整をしやすくするためのサービスです。"
  },
  {
    title: "2. アカウント",
    body: "ログインには Google アカウントを使います。利用者は、自分のアカウントを安全に管理してください。第三者による不正利用に気づいた場合は、できるだけ早く運営者へ連絡してください。"
  },
  {
    title: "3. 入力する情報",
    body: "利用者は、予定名、カテゴリ、場所メモ、候補日時、回答内容などを入力できます。共有リンクを知っている人は、ログインせずに回答できる場合があります。共有リンクの扱いには注意してください。"
  },
  {
    title: "4. 禁止事項",
    body: "他人になりすます行為、不正アクセス、サービスの妨害、法令や公序良俗に反する投稿、第三者の権利を侵害する行為は禁止します。"
  },
  {
    title: "5. サービスの変更・停止",
    body: "Madoi は開発中のサービスです。機能の追加、変更、停止が発生することがあります。重要な予定は、必要に応じて別の方法でも控えてください。"
  },
  {
    title: "6. 免責",
    body: "Madoi は、日程調整を補助するためのサービスです。入力内容の正確性、予定の成立、外部サービスの状態について、運営者は保証しません。"
  },
  {
    title: "7. 規約の変更",
    body: "必要に応じて、この規約を変更することがあります。重要な変更がある場合は、サービス上で分かるように案内します。"
  },
  {
    title: "8. お問い合わせ",
    body: "問い合わせ先は正式公開前に設定します。運用開始時には、連絡先メールアドレスまたは問い合わせフォームをこのページに掲載します。"
  }
];

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="利用規約" description="Madoi を使うときの基本ルールです。" />
      <Card>
        <p className="text-sm leading-7 text-ink/64">
          このページはドラフトです。正式公開前に、運用実態と法務観点に合わせて見直してください。
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
