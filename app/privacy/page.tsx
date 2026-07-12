import React from "react";
import { Card, PageHeader, SecondaryLink } from "@/components/ui";

const sections = [
  {
    title: "1. 取得する情報",
    body: "Madoi は、Google ログインで得られる利用者識別子、メールアドレス、表示名、プロフィール画像のほか、イベント作成・参加・回答で入力された情報を扱います。Google Calendar を連携した場合は、空き状況を確認するために予定の開始時刻と終了時刻を扱います。"
  },
  {
    title: "2. 利用目的",
    body: "取得した情報は、ログイン状態の維持、イベントの作成と参加、日程調整、入力内容の表示、サービスの運営と改善のために使います。"
  },
  {
    title: "3. Googleの情報",
    body: "Google Calendar の連携は任意です。予定名、場所、説明、Meet URL、添付ファイルは空き状況の集計には使いません。取得した予定の詳細はデータベースに保存せず、空き状況の確認に必要な範囲で扱います。連携を解除すると、保存している連携用トークンを削除します。"
  },
  {
    title: "4. 共有範囲",
    body: "イベントに入力された内容は、そのイベントの参加者に表示されます。日程回答用の共有リンクを使う場合は、リンクを受け取った人にイベント名、候補日時、回答に必要な情報が表示されることがあります。共有リンクは、意図しない相手に渡らないように扱ってください。"
  },
  {
    title: "5. 外部サービス",
    body: "Madoi は、認証、データ保存、Google ログインと Google Calendar 連携のために外部サービスを利用します。法令に基づく場合を除き、利用者の情報を本人の同意なく第三者へ提供しません。各サービスに送られる情報は、それぞれのプライバシーポリシーに従って扱われます。"
  },
  {
    title: "6. 安全管理",
    body: "Madoi は、情報への不正なアクセスや漏えいを防ぐため、必要な技術的・運用上の対策を行います。"
  },
  {
    title: "7. 保存期間",
    body: "アカウント情報、イベント情報、回答や清算に関する記録は、サービスの提供に必要な期間保存します。Google Calendar の連携を解除した場合、連携用トークンは削除します。"
  },
  {
    title: "8. お問い合わせ",
    body: "プライバシーに関するお問い合わせは、正式な問い合わせ窓口の公開後、その窓口から受け付けます。"
  }
];

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const returnHref = from === "login" ? "/login" : "/";

  return (
    <div className="space-y-6">
      <PageHeader
        title="プライバシーポリシー"
        description="Madoi で扱う情報と、その使い方です。"
        action={<SecondaryLink href={returnHref}>{from === "login" ? "ログインへ戻る" : "ホームへ戻る"}</SecondaryLink>}
      />
      <Card>
        <p className="text-sm leading-7 text-ink/64">施行日: 2026年7月10日</p>
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
