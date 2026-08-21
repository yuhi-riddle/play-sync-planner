# Madoi デザインルール

AIがUIを書くときに参照するルール。値の定義は [tokens.css](./tokens.css)、Tailwind 側の実体は `tailwind.config.ts`。

**生成したら、提示する前にこのファイルの禁止パターンと突き合わせること。** 省くと準拠率が落ちる。

---

## 面（もっとも重要）

**NG: カード面を半透明にする** — `bg-cream/88`, `bg-surface/90`, `backdrop-blur`
**代替: `bg-surface` で不透明にする**

理由: `globals.css` の背景グラデーションと山型装飾が透けて上がり、カード面と地の明度差を埋める。全画面が一枚のもやになる。これが過去に「平板」と評された直接の原因。

面は3段だけ:

| トークン | 用途 |
|---|---|
| `bg-canvas` | ページの地。`body` のみ |
| `bg-surface` | カード。**必ず不透明** |
| `bg-sunken` | カード内の一段沈んだ面（空状態、リスト行、メタ情報） |

---

## 文字色

**NG: `text-ink/68` のように黒の透明度で階層を作る**
**代替: `text-ink` / `text-muted` / `text-subtle` の3段から選ぶ**

理由: 暖色のベージュ地に黒を薄く重ねると、澄まない灰色になる。暖色地には暖色グレーを重ねる。

**NG: `text-subtle` を本文・ラベルに使う**
**代替: `text-muted`**

理由: `subtle` は surface 上で 3.2:1 しかなく WCAG AA (4.5:1) を満たさない。罫線・プレースホルダ・純粋な装飾のみ。

**NG: `text-moss` / `text-clay` / `text-honey` を文字色に使う**
**代替: `text-pine` / `text-clay-ink` / `text-honey-ink`**

理由: moss・clay・honey は淡い地の上だと文字として AA を割る。面と線には使ってよいが、文字には暗いバリアントを使う。

---

## 色の意味

色は装飾ではなく状態を表す。この対応を崩さない。

| 色 | 意味 | 使う場所 |
|---|---|---|
| `ink` | 本文・見出し | 通常のテキスト色。主CTAの背景には使わない |
| `moss` | 線・アイコン | 罫線、アイコン、`Badge` の done |
| `pine` / `pine-deep` | 主アクション・強調・確定 | 主CTAボタンの背景（`from-pine to-pine-deep` のグラデーション）、強調文字、hover、確定状態 |
| `clay` / `clay-ink` | 期限・要対応 | 期限バッジ、未回答、警告 |
| `honey` / `honey-ink` | 調整中 | 進行中バッジ |
| `category-*`(8色) | カテゴリ識別(ステータスとは別軸) | イベント一覧カードの左帯・カテゴリバッジ |
| `mist` / `skywash` | 情報・完了の面 | バッジの地、情報カード |

---

## 角丸

**NG: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl` など任意の値**
**代替: `rounded-card`(20px) / `rounded-control`(14px) / `rounded-full` の3値のみ**

- `rounded-card` — カード・セクション
- `rounded-control` — 入力欄、リスト行、沈んだ面
- `rounded-full` — ボタン、チップ、バッジ、アバター

---

## 影

**NG: `shadow-soft` をカードに常用する**
**代替: `shadow-raise`**

理由: カードの輪郭は `border-line` が担う。影は「浮き」の表現に取っておく。全カードに強い影が付くと、かえって階層が消える。

| トークン | 用途 |
|---|---|
| `shadow-raise` | カード常用 |
| `shadow-soft` | 主CTA、意図的に浮かせたカード |
| `shadow-lift` | ポップオーバー、ドロップダウン |

---

## タイポグラフィ

**NG: `tracking-[0.14em]` のようなアービトラリ字間**
**代替: `text-eyebrow`（字間を内包している）**

**NG: 強調のたびに `font-bold` を足す**
**代替: `text-title` / `text-stat` を使う**（ウェイトを内包している）

理由: 以前 `font-bold` が245箇所まで増え、太字が太字として機能しなくなっていた。

スケール:

| トークン | 用途 |
|---|---|
| `text-display` | ページ見出し（H1） |
| `text-title` | カード見出し |
| `text-body` | 本文 |
| `text-caption` | 補足 |
| `text-eyebrow` | 見出しの上のラベル（字間・大文字化を内包） |
| `text-stat` | 数値。`tabular-nums` と併用する |

**数字が縦に並ぶ場所（日付・人数・金額）には必ず `tabular-nums`。** `Stat` プリミティブを使えば自動で付く。

---

## コンポーネント

**NG: ページ側に長い Tailwind 文字列でバッジ・統計・アラートを組む**
**代替: `components/ui.tsx` のプリミティブを使う**（import元は `@/components/ui` のまま。実装は表示系を `ui-server.tsx`、操作系を `ui-client.tsx` に分けて `ui.tsx` が再エクスポートしている。追加・編集は分割先のファイルで行う）

| 用途 | プリミティブ |
|---|---|
| カード | `Card` |
| ページ見出し | `PageHeader`（`eyebrow` に画面カテゴリを渡す。ブランド名を入れない） |
| カード内見出し | `SectionHeading` |
| 状態表示 | `Badge`（tone: `neutral` / `info` / `warn` / `accent` / `done`） |
| 数値 | `Stat`（`emphasis="primary"` は1画面に1つまで） |
| 通知・警告 | `Alert` |
| 進捗 | `Progress` |
| 空状態 | `EmptyState` |

**NG: 空状態を破線ボーダーで囲う** — `border-dashed`
**代替: `EmptyState`（沈んだ面 + アイコン）**

理由: 破線は「まだ作りかけ」に見える。

---

## 情報設計

**NG: 件数0のフィルタチップを全種類並べる**
**代替: 件数があるものだけ出す。全部0なら、チップ行ごと出さずに空状態だけ**

理由: 「すべて0 / 期限0 / 未回答0…」は情報量がゼロなうえ、空っぽ感を増幅する。

**NG: グローバルヘッダーやページCTAと同じ導線を、ページ本文にもう一度置く**
**代替: 置かない**

理由: 以前ホームの一等地をクイックリンク4枚が占めていたが、うち2枚（イベント作成・設定）は上部と完全に重複していた。

**NG: 均等サイズのカードを並べて、どれが主役か示さない**
**代替: 主役を1つ決め、`Stat emphasis="primary"` などで視覚的な重みを与える**

**NG: 常時表示の左サイドバーを追加する**

理由: `docs/design/03_screen_flow.md` の設計方針。

**スマートフォンの下部固定ナビゲーションのみ例外**: 2026-07-17付の設計（`docs/superpowers/specs/2026-07-17-mobile-navigation-and-event-list-polish-design.md`）で、スマートフォンに限り「ホーム」「イベント」「カレンダー」「つながり」4項目の下部固定ナビゲーションを採用済み（`components/primary-nav.tsx`）。ログイン・同意・作成・編集・確定などの集中操作画面では表示しない（`lib/navigation-visibility.ts`）。デスクトップは従来どおりヘッダー直下の細いテキストナビ行のまま、固定下部ナビゲーションは出さない。新規に下部タブを追加する場合はこの1本に統合し、増やさない。

---

## アクセシビリティ

- タップ領域は `min-h-11`（44px）以上
- フォーカスは `focus:ring-2 focus:ring-clay focus:ring-offset-2`
- 色だけで状態を伝えない。`Badge` は必ずテキストを伴う
