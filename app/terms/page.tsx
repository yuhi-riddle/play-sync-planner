import React from "react";
import { Card, PageHeader, SecondaryLink } from "@/components/ui";

const sections = [
  {
    title: "1. 適用",
    body: "この利用規約は、Madoi を利用するすべての方に適用されます。Madoi を利用した時点で、この規約に同意したものとします。"
  },
  {
    title: "2. アカウント",
    body: "Madoi の利用には Google アカウントでのログインが必要です。アカウントは利用者自身の責任で管理し、他人に使わせないでください。"
  },
  {
    title: "3. 利用者の責任",
    body: "利用者は、イベント名、場所メモ、候補日時、回答内容、支払いに関する記録やメモなどを入力できます。入力内容は正確なものとし、他者の情報を扱うときは必要な配慮をしてください。入力内容は、イベントの参加者に表示される場合があります。"
  },
  {
    title: "4. 禁止事項",
    body: "法令に違反する行為、他者の権利や安全を損なう行為、不正なアクセス、サービスの運営を妨げる行為、他人の情報を無断で入力・公開する行為を禁止します。"
  },
  {
    title: "5. サービスの変更",
    body: "Madoi は、必要に応じて機能の追加、変更、停止を行うことがあります。重要な変更がある場合は、サービス上でお知らせします。"
  },
  {
    title: "6. 免責",
    body: "Madoi は日程調整やイベント管理を補助するサービスです。利用者同士の連絡、参加、支払いなどから生じた問題について、Madoi は責任を負いません。"
  },
  {
    title: "7. 利用規約の変更",
    body: "この規約は、必要に応じて変更することがあります。変更後の規約は、このページに掲載した時点から適用されます。"
  },
  {
    title: "8. お問い合わせ",
    body: "規約に関するお問い合わせは、正式な問い合わせ窓口の公開後、その窓口から受け付けます。"
  }
];

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const returnHref = from === "login" ? "/login" : "/";

  return (
    <div className="space-y-6">
      <PageHeader
        title="利用規約"
        description="Madoi を使うときの基本ルールです。"
        action={<SecondaryLink href={returnHref}>{from === "login" ? "ログインへ戻る" : "ホームへ戻る"}</SecondaryLink>}
      />
      <Card>
        <p className="text-sm leading-7 text-muted">施行日: 2026年7月10日</p>
        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
