# イベント詳細ページ 重複実装解消 デザインspec

## 背景

イベント詳細ページ（`app/events/[eventId]/page.tsx`）を調査した結果、Phase 1〜4で繰り返し発見・解消してきたのと同種の「生のクラス文字列によるコンポーネント重複実装」が4箇所見つかった。共有コンポーネント（`Card`/`SubmitButton`/`SectionHeading`）へ置き換えることで、他画面との視覚的統一とメンテナンス性を改善する。

ユーザーへビジュアルコンパニオンでBefore/Afterモックアップ（プランカード・見出し・ボタン）を提示し、「OK、この4点で進める」の承認を得た。

## 対象範囲

`app/events/[eventId]/page.tsx` 1ファイルのみ。`components/ui/server.tsx`/`client.tsx`の共有コンポーネント自体は変更しない。

## 変更内容（4点）

### 1. プラン一覧カードをCard化

現状（138行目）:
```tsx
<Link key={plan.id} href={`/plans/${plan.id}`} className="rounded-control border border-line bg-white p-4 shadow-soft hover:border-moss">
```

`bg-white`は非トークンの生色（`bg-surface`が正）。`rounded-control`/`shadow-soft`は共有`Card`の`rounded-card`/`shadow-raise`と異なる、独自の弱い立体感。`Link`はそのまま維持しつつ、`Card`と同じクラス構成（`rounded-card border border-line bg-surface shadow-raise`、内側paddingは`Card`のデフォルト`p-5`相当）に揃える。`hover:border-moss`は既存の意図（ホバー時の強調）を維持する。

### 2. 「このメンバーでもう一度」ボタンをSubmitButton化

現状（172-180行目）は独自の`<button type="submit">`実装。`components/ui/client.tsx`の`SubmitButton`（`variant="secondary"`）に置き換える。アイコン（`CopyPlus`）は`SubmitButton`の`icon`prop経由で渡す。

### 3. セクション見出し2箇所をSectionHeading化

- 134行目 `日程調整`: 付随情報なしのシンプルな見出し。`<SectionHeading title="日程調整" />`に置き換え。
- 203-209行目 `参加者`: 現状は`<div className="flex flex-wrap items-center justify-between gap-3">`で「タイトル＋説明文」と「右側の状態span」を手動で並べている。この構造は`SectionHeading`の`title`/`description`/`action`スロットとレイアウトが一致するため、外側divごと`<SectionHeading title="参加者" description={`参加済み ${memberCount ?? 0}人`} action={...状態span...} />`に置き換える。

見出しは`text-xl font-semibold`（20px/600）→`text-title`（17px/700、`SectionHeading`内部で固定）になり、他画面の見出しサイズと統一される。

### 4. 付随情報欄（`Info`コンポーネント）の文字サイズを型スケール内に

現状（449行目）:
```tsx
<dd className="mt-2 break-words text-base font-semibold text-ink">{value}</dd>
```

`text-base`（1rem）は型スケール外の値。既存コードベースで確立されているパターン（`text-body font-bold`、例: `components/home/home-selected-date-agenda.tsx:139`）に合わせ、`text-body font-bold`に変更する。

## 変更しないもの

- ページの構成・タブ構造・情報の並び順
- 色のトーン、ボタンの機能・アイコン（`CopyPlus`）
- `Card`/`SubmitButton`/`SectionHeading`コンポーネント自体
- `design/tokens.css` / `tailwind.config.ts`

## 検証方法

1. `npm run typecheck`
2. `npx vitest run --reporter=dot`（既存テストに退行がないこと）
3. `npm run build`
4. `npm run dev`でブラウザ実機確認: プランカードの立体感、ボタンの見た目・disabled/pending挙動、見出し2箇所のサイズ、付随情報欄の文字サイズ
