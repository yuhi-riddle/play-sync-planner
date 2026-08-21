# イベントカテゴリ差し色 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** イベント一覧カードに、カテゴリごとの差し色(左帯+ドット付きバッジ)を表示する。

**Architecture:** 8カテゴリぶんの色を `tailwind.config.ts`(正)と `design/tokens.css`(ミラー)にトークンとして追加し、`lib/domain/event/category-color.ts` の純粋関数でカテゴリ値→クラス名に変換、`app/events/page.tsx` の `EventCard` に適用する。既存の `Badge`/`BadgeTone`(ステータス用)には触れない。

**Tech Stack:** Next.js App Router / Tailwind CSS v3 / clsx / Vitest + Testing Library

## Global Constraints

- `tailwind.config.ts` と `design/tokens.css` は同時更新(`design/tokens.css` は実ビルドに未import・手動ミラーのみの運用)
- 色の意味テーブル(`design/rules.md`)を更新する。「色は装飾ではなく状態を表す」の方針を維持し、カテゴリ色も「カテゴリ識別」という意味を持つ行として明記する
- 適用範囲はイベント一覧カード(`app/events/page.tsx` の `EventCard`)のみ。下書きカード・絞り込みチップ・詳細ヘッダー・カレンダーは対象外
- テストは `tests/event/` 配下(`lib/domain/event/*.ts` に対応)、`--reporter=dot` で実行する
- Tailwindの動的クラス名は生成できない(ビルド時パージ)。クラス名は必ずリテラルで書く

---

### Task 1: カテゴリ色トークンを追加する

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `design/tokens.css`
- Modify: `design/rules.md`

**Interfaces:**
- Produces: Tailwindの色トークン `category-live` / `category-live-ink` / `category-travel` / `category-travel-ink` / `category-drinking` / `category-drinking-ink` / `category-nazotoki` / `category-nazotoki-ink` / `category-snowboard` / `category-snowboard-ink` / `category-boardgame` / `category-boardgame-ink` / `category-movie-stage` / `category-movie-stage-ink`(計14個、Task 2 が使う)

- [ ] **Step 1: `tailwind.config.ts` にカテゴリ色を追加**

`tailwind.config.ts` の `colors` オブジェクトに、既存の `skywash`/`mist` の直後(46行目付近、`}` の手前)へ以下を追加する:

```ts
        // カテゴリ差し色: clay/honeyと同じ明度・彩度(oklch L≈70-72% C≈0.12-0.13)で
        // 色相のみ変えている。clay(H≈33°)・honeyの(H≈82°)の色相帯はステータスバッジと
        // 同じカード上で意味が衝突するため避けている。*-ink はバッジ文字色用(L≈50%)。
        "category-live": "#c18dd8",
        "category-live-ink": "#7d4b92",
        "category-travel": "#44b2e2",
        "category-travel-ink": "#006e9a",
        "category-drinking": "#d57cb4",
        "category-drinking-ink": "#904475",
        "category-nazotoki": "#a098ec",
        "category-nazotoki-ink": "#6056a3",
        "category-snowboard": "#15bac6",
        "category-snowboard-ink": "#007681",
        "category-boardgame": "#39bda0",
        "category-boardgame-ink": "#00785f",
        "category-movie-stage": "#76a5ef",
        "category-movie-stage-ink": "#3662a7"
```

- [ ] **Step 2: `design/tokens.css` にミラーする**

`design/tokens.css` の `--madoi-mist` 行の直後(43行目付近)へ追加する:

```css
  /* カテゴリ差し色。値は tailwind.config.ts と同じにする（このファイルはビルド未使用のミラー） */
  --madoi-category-live: #c18dd8;
  --madoi-category-live-ink: #7d4b92;
  --madoi-category-travel: #44b2e2;
  --madoi-category-travel-ink: #006e9a;
  --madoi-category-drinking: #d57cb4;
  --madoi-category-drinking-ink: #904475;
  --madoi-category-nazotoki: #a098ec;
  --madoi-category-nazotoki-ink: #6056a3;
  --madoi-category-snowboard: #15bac6;
  --madoi-category-snowboard-ink: #007681;
  --madoi-category-boardgame: #39bda0;
  --madoi-category-boardgame-ink: #00785f;
  --madoi-category-movie-stage: #76a5ef;
  --madoi-category-movie-stage-ink: #3662a7;
```

- [ ] **Step 3: `design/rules.md` の「色の意味」表に1行足す**

`design/rules.md` の55行目(`honey` の行)の直後に追加する:

```markdown
| `category-*`(8色) | カテゴリ識別(ステータスとは別軸) | イベント一覧カードの左帯・カテゴリバッジ |
```

- [ ] **Step 4: ビルドが通ることを確認**

Run: `npm run build`
Expected: エラーなく完了する(新トークンの構文ミスがあればここで検出される)

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts design/tokens.css design/rules.md
git commit -m "feat: add 8 category accent color tokens"
```

---

### Task 2: カテゴリ→クラス名の変換関数を作る

**Files:**
- Create: `lib/domain/event/category-color.ts`
- Test: `tests/event/category-color.test.ts`

**Interfaces:**
- Consumes: `EVENT_CATEGORIES` from `@/lib/shared/constants`(`lib/shared/constants.ts:1-10`)
- Produces: `categoryAccent(category: string): CategoryAccentClasses`、型 `CategoryAccentClasses = { bar: string; badgeBg: string; badgeText: string; dot: string }`(Task 3 が使う)

- [ ] **Step 1: 失敗するテストを書く**

`tests/event/category-color.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";

import { categoryAccent } from "@/lib/domain/event/category-color";

describe("categoryAccent", () => {
  it("returns the matching accent classes for a known category", () => {
    expect(categoryAccent("nazotoki")).toEqual({
      bar: "border-l-category-nazotoki",
      badgeBg: "bg-category-nazotoki/16",
      badgeText: "text-category-nazotoki-ink",
      dot: "bg-category-nazotoki"
    });
  });

  it("returns distinct accent classes for every one of the 8 categories", () => {
    const categories = ["live", "travel", "drinking", "nazotoki", "snowboard", "boardgame", "movie_stage", "other"];
    const results = categories.map((category) => categoryAccent(category).dot);
    expect(new Set(results).size).toBe(categories.length);
  });

  it("falls back to the other/neutral accent for an unknown value", () => {
    expect(categoryAccent("not-a-real-category")).toEqual({
      bar: "border-l-line-strong",
      badgeBg: "bg-sunken",
      badgeText: "text-muted",
      dot: "bg-subtle"
    });
  });

  it("uses the same neutral accent for the other category explicitly", () => {
    expect(categoryAccent("other")).toEqual(categoryAccent("not-a-real-category"));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run tests/event/category-color.test.ts --reporter=dot`
Expected: FAIL(`lib/domain/event/category-color.ts` が存在しない)

- [ ] **Step 3: 実装する**

`lib/domain/event/category-color.ts` を新規作成:

```ts
import { EVENT_CATEGORIES } from "@/lib/shared/constants";

export type CategoryAccentClasses = {
  bar: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
};

type Category = (typeof EVENT_CATEGORIES)[number];

const otherAccent: CategoryAccentClasses = {
  bar: "border-l-line-strong",
  badgeBg: "bg-sunken",
  badgeText: "text-muted",
  dot: "bg-subtle"
};

const categoryAccents: Record<Category, CategoryAccentClasses> = {
  live: {
    bar: "border-l-category-live",
    badgeBg: "bg-category-live/16",
    badgeText: "text-category-live-ink",
    dot: "bg-category-live"
  },
  travel: {
    bar: "border-l-category-travel",
    badgeBg: "bg-category-travel/16",
    badgeText: "text-category-travel-ink",
    dot: "bg-category-travel"
  },
  drinking: {
    bar: "border-l-category-drinking",
    badgeBg: "bg-category-drinking/16",
    badgeText: "text-category-drinking-ink",
    dot: "bg-category-drinking"
  },
  nazotoki: {
    bar: "border-l-category-nazotoki",
    badgeBg: "bg-category-nazotoki/16",
    badgeText: "text-category-nazotoki-ink",
    dot: "bg-category-nazotoki"
  },
  snowboard: {
    bar: "border-l-category-snowboard",
    badgeBg: "bg-category-snowboard/16",
    badgeText: "text-category-snowboard-ink",
    dot: "bg-category-snowboard"
  },
  boardgame: {
    bar: "border-l-category-boardgame",
    badgeBg: "bg-category-boardgame/16",
    badgeText: "text-category-boardgame-ink",
    dot: "bg-category-boardgame"
  },
  movie_stage: {
    bar: "border-l-category-movie-stage",
    badgeBg: "bg-category-movie-stage/16",
    badgeText: "text-category-movie-stage-ink",
    dot: "bg-category-movie-stage"
  },
  other: otherAccent
};

/** 未知の値(不正データ・将来の削除カテゴリ跡地)は other 扱いにする。 */
export function categoryAccent(category: string): CategoryAccentClasses {
  return category in categoryAccents ? categoryAccents[category as Category] : otherAccent;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npx vitest run tests/event/category-color.test.ts --reporter=dot`
Expected: PASS (4)

- [ ] **Step 5: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add lib/domain/event/category-color.ts tests/event/category-color.test.ts
git commit -m "feat: add categoryAccent domain function mapping categories to accent classes"
```

---

### Task 3: イベント一覧カードに反映する

**Files:**
- Modify: `app/events/page.tsx:1-11`(import追加)、`app/events/page.tsx:218-241`(`EventCard`)
- Modify: `tests/event/events-page.test.tsx:112`(既存の「カテゴリを出さない」アサーションを更新)
- Test: `tests/event/events-page.test.tsx`(新規テストケースを追加)

**Interfaces:**
- Consumes: `categoryAccent(category: string): CategoryAccentClasses` from `@/lib/domain/event/category-color`(Task 2)、`categoryLabels` from `@/lib/shared/constants`、`normalizeCategory` from `@/lib/domain/event/event-filter`

- [ ] **Step 1: 既存テストを読み、矛盾するアサーションを特定する**

`tests/event/events-page.test.tsx:90-117` の `"shows one concrete state and keeps the event card concise"` は、112行目で `within(eventCardLink).queryByText("謎解き")` が **出ないこと** を確認している。これは「カードは簡潔に保つ」という当時の設計を検証したものだが、今回カテゴリ表示を追加するのでこの前提が変わる。

- [ ] **Step 2: 既存テストを更新(失敗させてから直す)**

まず現状のまま実行して既存テストが通ることを確認する。

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: PASS(まだ実装前なので現状の挙動のまま通る)

`tests/event/events-page.test.tsx` の112行目を以下に置き換える:

```ts
    expect(within(eventCardLink).getByText("謎解き")).toBeInTheDocument();
```

- [ ] **Step 3: カテゴリバッジの新規テストを追加**

`tests/event/events-page.test.tsx` の `"shows one concrete state and keeps the event card concise"` テストの直後(117行目の `});` の次)に新規テストを追加する:

```ts
  it("colors each event card's left edge and badge by category", async () => {
    const eventQuery = createEventQuery([
      { ...makeEvent("event-1", "夏合宿"), category: "travel" },
      { ...makeEvent("event-2", "3丁目にて"), category: "not-a-real-category" }
    ]);
    const rpc = createRpcResult(["event-1", "event-2"], 2);
    const draftQuery = createDraftQuery(null);
    createSupabaseServerClient.mockResolvedValue({
      rpc,
      from: vi.fn((table: string) => (table === "event_drafts" ? draftQuery : eventQuery))
    });

    render(await EventsPage({ searchParams: Promise.resolve({}) }));

    const travelCardLink = screen.getByRole("link", { name: /夏合宿/ });
    expect(within(travelCardLink).getByText("旅行")).toBeInTheDocument();
    expect(travelCardLink.closest("section")).toHaveClass("border-l-category-travel");

    const otherCardLink = screen.getByRole("link", { name: /3丁目にて/ });
    expect(within(otherCardLink).getByText("その他")).toBeInTheDocument();
    expect(otherCardLink.closest("section")).toHaveClass("border-l-line-strong");
  });
```

- [ ] **Step 4: テストを実行して失敗を確認**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: FAIL(カテゴリバッジ未実装、112行目の「謎解き」も見つからない)

- [ ] **Step 5: `app/events/page.tsx` を実装する**

import 行(1-11行目)に以下を追加する:

```ts
import { clsx } from "clsx";
```

```ts
import { categoryAccent } from "@/lib/domain/event/category-color";
```

`EventCard` 関数(218-241行目)を以下に置き換える:

```tsx
function EventCard({ event, showCancel }: { event: EventRow; showCancel: boolean }) {
  const summary = getEventCardSummary(event);
  const scheduleText = formatSchedule(summary.schedule);
  const locationText = event.location_name?.trim() || null;
  const normalizedCategory = normalizeCategory(event.category);
  const category = normalizedCategory === "all" ? "other" : normalizedCategory;
  const accent = categoryAccent(category);

  return (
    <Card className={clsx("border-l-4 transition-colors hover:border-moss/45", accent.bar)}>
      <Link href={`/events/${event.id}`} className="block focus:outline-none focus:ring-2 focus:ring-clay">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={eventDisplayStateTones[summary.displayState]}>{eventDisplayStateLabels[summary.displayState]}</Badge>
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-caption font-bold",
              accent.badgeBg,
              accent.badgeText
            )}
          >
            <span aria-hidden="true" className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />
            {categoryLabels[category]}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-bold text-ink">{event.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {scheduleText ? <Meta icon={CalendarDays} text={scheduleText} strong={summary.schedule.isConfirmed} /> : null}
          {locationText ? <Meta icon={MapPin} text={locationText} /> : null}
          <Meta icon={UsersRound} text={`参加 ${summary.joinedCount}人`} />
        </div>
      </Link>
      {showCancel && !isEventLifecycleFinished(event) ? (
        <div className="mt-4 border-t border-line pt-4">
          <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
        </div>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npx vitest run tests/event/events-page.test.tsx --reporter=dot`
Expected: PASS(全件)

- [ ] **Step 7: 型チェック・lint**

Run: `npm run typecheck`
Expected: エラーなし

Run: `npm run lint`
Expected: `ESLint: No issues found`

- [ ] **Step 8: フルテストスイートを実行**

Run: `npx vitest run --reporter=dot`
Expected: 既存テストを含め全件PASS

- [ ] **Step 9: 実機確認**

`npm run dev` を起動し、`/events` を開いて以下を確認する:
- カードごとに左端の色帯とカテゴリバッジが表示される
- 同じカードにステータスバッジ(調整中・期限など)とカテゴリバッジが並んでも見分けがつく
- モバイル幅・デスクトップ幅の両方でバッジが折り返さず崩れない

- [ ] **Step 10: Commit**

```bash
git add app/events/page.tsx tests/event/events-page.test.tsx
git commit -m "feat: show category color accent on event list cards"
```

---

### Task 4: mainへの反映

**Files:** なし(レビューのみ)

- [ ] **Step 1: `/code-review` を実行する**

`projects/play-sync-planner/standards/codex-review-before-main-push.md` の運用ルール通り、mainへの反映前に必ずレビューを通す。

Run: `/code-review --level high`

- [ ] **Step 2: 指摘があれば裏取りしてから対応する**

`knowledge/codex-findings-need-verification.md` の通り、指摘は鵜呑みにせず実コード・実機で確認してから直す。

- [ ] **Step 3: push**

```bash
git push
```
