# イベントカテゴリの差し色(展開第2弾: 絞り込みチップ・詳細ヘッダー)

作成: 2026-08-22

## 背景

`docs/superpowers/specs/2026-08-21-event-category-accent-colors-design.md` でイベント一覧カードにカテゴリ差し色を導入した際、絞り込みチップ・詳細ヘッダー・カレンダーは「反応を見てから」スコープ外にした。一覧カードは実装・レビューを終えて安定しているため、次の展開先を検討した。

ブレインストーミングで以下を決定した。

1. **対象は絞り込みチップと詳細ヘッダーの2箇所**。ホーム「選択日の予定」は対象外(3つの制約: 左帯が既に状態表示に使用中/Google Calendar由来の予定にカテゴリ概念がない/表示データにカテゴリが渡っておらず配管作業が必要)
2. 絞り込みチップは**ドットのみ**追加(A1)。チップの枠・地色・選択中のpine塗りは変更しない
3. 詳細ヘッダーは、当初「一覧カードと同じピルを情報行に追加」する軽量案(B1)を検討したが、8/21のスコープ確認モックアップ(`design/proposals/2026-08-21-category-color-placement.html`)で既に見せていた**アイコンバッジ案(B2)を採用**。ページ見出しにカテゴリ色の角丸正方形+アイコンを置く
4. B2のためにカテゴリごとのアイコンを新規に選定(下表)。絵文字は使わず、プロジェクトで統一して使っている`lucide-react`から選ぶ

## 対象外にした理由の詳細

- ホーム「選択日の予定」(`components/home/home-selected-date-agenda.tsx`): 左端4px境界線は既に`itemAccentClass()`で「調整中(honey)/確定(moss)」という状態を表しており、同じ場所にカテゴリ色を足すと意味が衝突する。加えて表示データ`HomeAgendaItem`(`lib/domain/home/home-agenda.ts`)はGoogle Calendar由来の項目も含み、カテゴリという概念自体を持たない。カテゴリを持つのはMadoi側のイベントだけなので、混在リストに一部だけ色が付く不整合も生まれる
- 詳細ヘッダーのB1(情報行にピル)は却下ではなく「小さすぎた」。過去のモックアップで既に見せていた見え方(B2)の方がユーザーの記憶・期待と一致していた

## A. カテゴリ絞り込みチップ

対象: `components/event/event-category-filter.tsx` のデスクトップ版チップ(`hidden sm:flex` 側)。モバイル版のネイティブ`<select>`は対象外(オプション内にドットを描けないため、現状のまま)。

- `FilterChip`に`dotClassName?: string`を追加し、渡された場合は`children`の前に`<span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)} />`を描く
- 呼び出し側の`options.map`で、`value`が実カテゴリの場合のみ`categoryAccent(value).dot`を`dotClassName`として渡す。`value === "all"`は渡さない(ドット無し、現状のまま)
- 選択中(pine塗り)のチップでもドットは表示したままにする。背景に馴染んで見えなくなるのを避けるため、ドットに`ring-2 ring-white/70`相当の白リングを常時つける(未選択時は地色が白系なので目立たないが、崩れはしない)

## B. イベント詳細ヘッダーのアイコンバッジ

対象: `app/events/[eventId]/page.tsx` の`PageHeader`呼び出し。

### PageHeader への口の追加

`components/ui/server.tsx`の`PageHeader`は26画面で共有している汎用コンポーネント。カテゴリの知識を持ち込まず、**汎用の`icon?: ReactNode`スロット**を追加するだけにする。

```tsx
export function PageHeader({ title, description, eyebrow, action, summary, icon }: {
  // ...既存
  /** タイトル左に置く正方形のアイコン。省略時は何も出さない */
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raise sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon}
        <div className="min-w-0">
          <p className="text-eyebrow uppercase text-pine">{eyebrow ?? brand.shortName}</p>
          <h1 className="mt-2 break-words text-display text-ink">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-body text-muted">{description}</p> : null}
          {summary ? <div className="mt-3">{summary}</div> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
```

既存25画面は`icon`を渡さないため`null`のまま、見た目は変わらない。

### カテゴリアイコンの色・形

新規: `lib/domain/event/category-icon.ts` — `categoryAccent`と対になる、カテゴリ→lucideアイコンの純粋なマッピング関数。

```ts
import { Beer, Clapperboard, Dices, MicVocal, Plane, Puzzle, Snowflake, Tag, type LucideIcon } from "lucide-react";
import { EVENT_CATEGORIES } from "@/lib/shared/constants";

type Category = (typeof EVENT_CATEGORIES)[number];

const categoryIcons: Record<Category, LucideIcon> = {
  live: MicVocal,
  travel: Plane,
  drinking: Beer,
  nazotoki: Puzzle,
  snowboard: Snowflake,
  boardgame: Dices,
  movie_stage: Clapperboard,
  other: Tag
};

/** 未知の値は other(Tag)扱いにする。categoryAccent の未知値処理と揃える。 */
export function categoryIcon(category: string): LucideIcon {
  return category in categoryIcons ? categoryIcons[category as Category] : Tag;
}
```

新規: `components/event/category-icon-badge.tsx` — 40px角丸正方形のアイコンバッジ。色は`categoryAccent(category).dot`(既存の`bg-category-*`クラス)をそのまま背景に使い、**新規トークンは追加しない**。

```tsx
import { clsx } from "clsx";

import { categoryAccent } from "@/lib/domain/event/category-color";
import { categoryIcon } from "@/lib/domain/event/category-icon";

export function CategoryIconBadge({ category }: { category: string }) {
  const accent = categoryAccent(category);
  const Icon = categoryIcon(category);
  return (
    <div className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white", accent.dot)}>
      <Icon aria-hidden="true" className="h-5 w-5" />
    </div>
  );
}
```

`app/events/[eventId]/page.tsx`側は一覧カードと同じ正規化を行ってから渡す(`normalizeCategory`が`"all"`を返す可能性があるための変換。一覧カード実装と同一パターン):

```tsx
const normalizedCategory = normalizeCategory(event.category);
const category = normalizedCategory === "all" ? "other" : normalizedCategory;
// ...
<PageHeader
  eyebrow="Event"
  title={event.title}
  icon={<CategoryIconBadge category={category} />}
  // 既存の action / summary はそのまま
/>
```

### カテゴリ→アイコン対応表(確認済み)

| カテゴリ | ラベル | アイコン(lucide-react) |
|---|---|---|
| `live` | ライブ | `MicVocal` |
| `travel` | 旅行 | `Plane` |
| `drinking` | 飲み会 | `Beer` |
| `nazotoki` | 謎解き | `Puzzle` |
| `snowboard` | スノボ | `Snowflake` |
| `boardgame` | ボードゲーム | `Dices` |
| `movie_stage` | 映画・舞台 | `Clapperboard` |
| `other` | その他 | `Tag` |

Artifactで実物のアイコン・色の組み合わせを提示し、ユーザー承認済み。

## テスト

- `tests/event/category-icon.test.ts`(新規): 8カテゴリすべてが対応する`LucideIcon`コンポーネントを返すこと、未知の値が`Tag`にフォールバックすることを、既存の`category-color.test.ts`と同じ形式で確認する
- `tests/event/event-category-filter.test.tsx`(追記): カテゴリごとのチップに`bg-category-*`のドット要素が存在すること、「すべて」チップにはドットが無いことを確認する
- `tests/event/event-detail-page.test.tsx`(追記): カテゴリに応じた`CategoryIconBadge`(`bg-category-*`クラス+対応アイコン)が`PageHeader`内に描画されることを確認する
- 新規コンポーネントの単体テストは不要(既存の`category-color.test.ts`スタイルに倣い、ロジックはユニットテスト・見た目はドメインテストのクラス名確認で代替する、プロジェクト既存の作法)

## スコープ外(引き続き)

- ホーム「選択日の予定」・カレンダー月表示 — 今回のスコープ外(理由は上記)
- 絞り込みチップのモバイル`<select>` — ネイティブ要素の制約でドット非対応のまま
- カテゴリの自由入力化 — 8/21の設計docで見送り済み、今回も対象外
