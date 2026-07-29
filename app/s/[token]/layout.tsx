import type { Metadata } from "next";

// トークンだけで参加者名・金額が見える公開ページなので、検索エンジンに載せない。
// robots.txt を無視するクローラ対策として、ページ側にも明示する。
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
