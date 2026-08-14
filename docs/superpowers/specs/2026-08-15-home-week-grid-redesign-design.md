# ホーム週表示グリッド リデザイン（リデザイン第3弾）

作成: 2026-08-15

## 背景

リデザイン第1弾（PR #13、STEP表示・回答セグメント・共通Buttonプリミティブ）、第2弾（同PR、清算画面の進捗ドット化・半透明面解消・ボタン統一）に続く第3弾。第2弾のspec作成時に「次点候補」として認識していたホームの週表示グリッド（`components/home/home-selected-date-agenda.tsx`）を対象に、実コードと `design/rules.md` を照合したところ、以下3点の具体的な課題が見つかった。

1. **窮屈さ**: 週表示グリッド（274-295行目）が `gap-0.5 sm:gap-1` の詰まった間隔で、曜日ラベルが型スケール外の `text-[0.7rem]`（11.2px）まで縮小されている
2. **曜日色分けロジックの重複と不整合**: `weekdayTone`関数（78-87行目）が日曜に `text-clay-ink`、土曜に `text-pine` を使っている。実は `lib/shared/calendar-styles.ts` に同じ目的の共有関数 `weekdayClass` が既に存在し、`components/plan/adjustment-calendar-view.tsx`（プラン作成時の月カレンダー）でテスト済みで使われている（日曜 `text-clay-ink`・土曜 `text-sky-700`）。`weekdayTone` はこれを再利用せず自前実装しており、しかも土曜の色が `text-sky-700` ではなく `text-pine` になっていて、アプリ内で同じ「曜日の色分け」が2種類の実装・2種類の配色で存在してしまっている
3. **フォーカスリングの実装漏れ**: 週送りボタン（266, 269行目）と日付セルボタン（284行目）に `focus:ring-offset-2` が付いていない（`design/rules.md` 160行目で必須と規定、他のボタンには付いている）

トーン（暖色ベージュ系トークンを維持し装飾を削ぐ）とスマホ優先方針は第1・2弾を踏襲する。

## スコープ

- `components/home/home-selected-date-agenda.tsx`（このファイルのみ）

### スコープ外

- ホームページ全体の構成・他セクション（`app/page.tsx` の他部分、`HomeNextConfirmedEventCard` など）
- 週表示グリッドの構造自体（7列グリッド・前後週ナビ・今日/明日/週末ショートカットという仕組みは変えない。ユーザー承認済みの方針）
- `design/tokens.css` / `tailwind.config.ts` の変更（既存トークンの範囲内で実装）

## 変更内容

### 1. 週表示グリッドの余白改善

274-295行目の週グリッド部分を調整する。

- セル間隔: `grid-cols-[repeat(7,minmax(0,1fr))] gap-0.5 sm:gap-1` → `gap-1 sm:gap-1.5`
- 曜日ラベル: `text-[0.7rem] font-bold sm:text-caption`（型スケール外の値） → `text-caption font-bold`（プロジェクト既定の型スケールに統一。フォントサイズは実質同じ0.75rem、命名を揃えるだけ）
- 日付数字: `text-xs font-bold tabular-nums sm:text-body` → `text-caption font-bold tabular-nums sm:text-body`（同上）
- セル内padding: `px-0.5 py-2 sm:px-1` → `px-1 py-2 sm:px-1.5`
- グリッド構造（7列・`min-h-14 sm:min-h-16`）・前後週ナビの仕組みは変更しない

### 2. 曜日の色分けを既存の共有関数に統一

自前の `weekdayTone`関数（78-87行目）を削除し、代わりに既存の `lib/shared/calendar-styles.ts` の `weekdayClass(dayIndex: number)` を使う。プラン作成の月カレンダーと同じ配色（日曜 `text-clay-ink`・土曜 `text-sky-700`・平日 `text-muted`）になり、重複実装も解消する。

```tsx
// 削除
function weekdayTone(dateKey: string) {
  const day = dateFromKey(dateKey).getDay();
  if (day === 0) {
    return "text-clay-ink";
  }
  if (day === 6) {
    return "text-pine";
  }
  return "text-muted";
}
```

```tsx
// 追加(ファイル冒頭のimportに追加)
import { weekdayClass } from "@/lib/shared/calendar-styles";
```

288行目の呼び出し箇所を `weekdayTone(dateKey)` から `weekdayClass(dateFromKey(dateKey).getDay())` に置き換える。`weekdayClass`は曜日index（`Date.getDay()`の0-6）を受け取る関数で、`dateKey`から`Date`への変換はこのファイル既存の`dateFromKey`をそのまま使う。

### 3. フォーカスリングの統一

`design/rules.md` の `focus:ring-2 focus:ring-clay focus:ring-offset-2` に揃える。

- 266, 269行目（週送りの矢印ボタン）: `focus:outline-none focus:ring-2 focus:ring-clay` → `focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2`
- 284行目（日付セルボタン）: 同様に `focus:ring-offset-2` を追加

### 4. `DateShortcut` を共通Buttonベースに統一

`DateShortcut`コンポーネント（114-126行目）は、実質的に共通 `Button` の `primary`/`secondary` とほぼ同じクラスの独自実装になっている。

現状:
```tsx
className={clsx(
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-body font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2",
  active ? "bg-ink text-white shadow-soft" : "border border-line-strong bg-surface text-muted hover:border-moss hover:text-pine"
)}
```

これを `components/ui/server.tsx` の `Button` に置き換える。

```tsx
<Button variant={active ? "primary" : "secondary"} onClick={onSelect} aria-current={active ? "date" : undefined}>
  {children}
</Button>
```

`DateShortcut`関数自体はそのまま残す（`onSelect`/`active`/`children`という呼び出し側のインターフェースは変えない）か、呼び出し側3箇所（251, 254, 257行目）で直接`Button`を使うかは実装時に既存コードの読みやすさで判断してよい（この程度の薄いラッパーはどちらでも実害がないため）。

**見た目の変化**: 非アクティブ時の文字色が `text-muted` → `text-ink`（共通`secondary`の色）にわずかに濃くなる。アクティブ時（`primary`相当）は元々一致しているため変化なし。この差は第2弾のTask4で承認済みの「共通Buttonへの統一に伴う意図的な差」と同種。

## 変更しないもの

- 週表示グリッドの構造（7列・前後週ナビ・今日/明日/週末ショートカットという仕組み）
- `AgendaItem`（選択日の予定一覧、129-167行目）— 別コンポーネントで今回のスコープ外
- Google Calendar連携ロジック・状態表示
- `design/tokens.css` / `tailwind.config.ts`

## 実装順序

1. `weekdayTone`関数を削除し`weekdayClass`（`lib/shared/calendar-styles.ts`）に置き換え（独立、他への影響なし）
2. 週グリッドの間隔・型スケール調整
3. フォーカスリングの統一
4. `DateShortcut`のButtonベース化
5. 検証

## テスト方針

- `tests/home/home-selected-date-agenda.test.tsx`を確認し、`weekdayTone`や個別クラス名を直接アサートしているテストがあれば`weekdayClass`使用後の構造に合わせて更新。`tests/calendar/calendar-styles.test.ts`（`weekdayClass`自体のテスト）は変更不要
- `npm run typecheck` / `npm test` / `npm run build`
- 実機確認: スマホ幅(390px)で週グリッドの間隔・曜日色（プラン作成の月カレンダーと同じ配色になっているか）・今日/明日/週末ボタンの見た目、キーボード操作でのフォーカスリング表示

## 実機での確認観点

- 週グリッドが窮屈な印象なく表示され、7列という構造・タップ領域(44px以上)は変わらないこと
- 日曜・土曜の色分けが、プラン作成の月カレンダー（`adjustment-calendar-view.tsx`）と同じ配色（日曜`text-clay-ink`・土曜`text-sky-700`）になっていること
- Tabキー操作で週送りボタン・日付セルにフォーカスリングが正しく表示されること
- 今日/明日/週末ボタンの非アクティブ時の文字色が、共通secondaryボタンと同じ濃さになっていること
