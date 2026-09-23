# ナビ再設計: 通知を下部ナビへ、右上は「設定」1つに（Batch B）

- 日付: 2026-09-23
- ステータス: 設計確定（実装計画待ち）
- 比較シート: `design/proposals/2026-09-23-nav-redesign.html`（置き場所3案）、`design/proposals/2026-09-23-nav-settings-button.html`（設定ボタンの見た目3案）
- 前段: `docs/superpowers/specs/2026-08-31-home-calendar-list-brushup-design.md` の「Batch B（別途）」

## 背景

通知・設定に行きにくい。

- 通知の入口は、ヘッダー右上にある小さなベル（44px の丸ボタン）だけ。未読バッジがあっても目に入りにくい
- 設定の入口は、ヘッダー右上のアバター画像。スマホではラベルが無く、押すと設定に行くことが分からない
- ヘッダー右上に丸ボタンが3つ（アバター・ベル・ログアウト）並び、スマホでは窮屈

これとは別に、「ナビを出すかどうか」の判定が3箇所に散っている。

1. `lib/domain/account/navigation-visibility.ts` の `shouldShowPrimaryNavigation`（下部ナビ）
2. `components/layout/mobile-event-fab.tsx` の `isFabVisiblePath`（作成ボタン FAB。1 にも依存）
3. `app/layout.tsx` の本文・フッターにある `pb-36`（下部ナビと FAB 用の下余白。ナビの表示・非表示に関係なく常に入る）

## ゴール

- 通知と設定に、どの画面からも1タップで行ける。入口を見れば、押した先が分かる
- 下部ナビ・FAB・下余白を「この画面で何を出すか」という1つの判定で決める

## 決定事項

| 項目 | 決定 |
|---|---|
| ナビの構成 | 下部ナビを5項目にする: ホーム・イベント・カレンダー・つながり・**通知**。通知には未読バッジ（数字、100件以上は「99+」） |
| スマホとPC | 項目は同じ。置き場所だけが違う（スマホ＝画面下に固定、PC＝ヘッダーのすぐ下に横一列）。今の `PrimaryNav` の仕組みのまま |
| ヘッダー右上 | ボタンは1つだけ。**アバター＋「設定」**で `/settings` へ移動。スマホ・PC共通 |
| プロフィール未設定 | 今と同じく「プロフィール設定」（`/onboarding/profile` へ）を出す。middleware が未設定の人をオンボーディングへ送るので、実際に目にするのはオンボーディング画面の上くらい |
| ベル | ヘッダーから外す（通知は下部ナビへ移る） |
| ログアウト | ヘッダーから外し、設定画面の一番下（「退会」カードのすぐ上）にカードとして置く |
| ホームの優先通知カード | 残す（未読件数ではなく「いま対応が要る通知」を見せるカードで、役割が違う） |
| 表示判定 | 下部ナビ・FAB・下余白の3つを、1つの関数で決める |
| PR | 2本に分ける。PR1＝表示判定の統合、PR2＝ナビの見た目の変更 |

見送った案: 下部ナビの5つ目を「メニュー」にしてシートに通知・設定をまとめる案と、左ドロワー案。どちらも通知が今より1タップ遠くなり、困りごとを悪化させる。下部ナビの枠が5つで埋まる点は、将来項目を足すときに「メニュー」方式へ移ることで対応する。

## 設計

### 1. 表示判定の統合（PR1）

`lib/domain/account/navigation-visibility.ts` に、画面ごとの「出すもの」をまとめて返す関数を置く。

```ts
export type NavigationChrome = {
  primaryNav: boolean; // 下部ナビ（PCではヘッダー下のナビ行）
  createFab: boolean; // イベント作成ボタン
  bottomInset: boolean; // スマホで固定ナビに本文が隠れないための下余白
};

export function getNavigationChrome(pathname: string, isSignedIn: boolean): NavigationChrome;
```

- `primaryNav` = ログイン中 かつ 今の `shouldShowPrimaryNavigation(pathname)` と同じ条件
- `createFab` = `primaryNav` かつ パスが `/events` か `/plans`（今の `isFabVisiblePath` をここへ移す）
- `bottomInset` = `primaryNav`（ナビが無い画面では余白も要らない）
- `shouldShowPrimaryNavigation` は、`tests/layout/focused-page-back-link.test.ts` などが使っているので残す。`getNavigationChrome` はこれを内部で使う

利用側:

- `PrimaryNav`: `getNavigationChrome(...).primaryNav` を見る
- `MobileEventFab`: `getNavigationChrome(...).createFab` を見る。独自の `isFabVisiblePath` は消す
- 下余白: `app/layout.tsx` はサーバーコンポーネントで pathname を持てない。本文・フッターの `pb-36` を外し、クライアントコンポーネント `BottomNavSpacer`（`components/layout/bottom-nav-spacer.tsx`）をフッターの後ろに置く。`bottomInset` が true のときだけ、スマホ幅で高さ `h-36` の空要素を描く（`sm:hidden`）

見た目の変化は、ナビが無い画面（作成・編集・確定・共有リンクなど）の下にあった余分な空白が消えることだけ。

### 2. ナビの見た目の変更（PR2）

**下部ナビ（`components/layout/primary-nav.tsx`）**

- `items` に `{ href: "/notifications", label: "通知", icon: Bell }` を足す。`grid-cols-4` / `sm:grid-cols-4` を `5` に
- 未読件数を `unreadCount: number` として props で受け、通知項目にバッジを重ねる。見た目は今のベルのバッジ（`bg-clay`、白文字、`99+` 上限）を流用
- アクセシブルな名前は「通知 未読3件」の形（今のベルの `aria-label` と同じ規則）。未読0件なら「通知」
- 5項目にすると、スマホで1項目の幅は約75px（375px 幅）。ラベルは今の `truncate` のまま。一番長い「カレンダー」（5文字・`text-xs`）も収まる

**未読件数の取得**

今は `AuthNav` が `notifications` を数えている。この取得を `app/layout.tsx` に移し、`PrimaryNav` に渡す。レイアウトでは `getCurrentUser()` をすでに1回呼んでいるので、ユーザーがいるときだけ件数を数える。`AuthNav` からは件数の取得を消す。既読にしたときの反映は、今と同じくレイアウトの再描画に任せる（通知のサーバーアクションが `revalidatePath` している）。

**ヘッダー右上（`components/layout/auth-nav.tsx`）**

- ベルとログアウトのフォームを消す
- プロフィールのリンクを「アバター＋『設定』」のボタンにする。行き先は `/settings`（`#profile` は付けない。設定画面の先頭がプロフィールなので同じ位置に着く）
- `aria-label` は「設定（ニックネーム）」。誰でログインしているかを、読み上げでも分かるようにする
- アバター画像が無いときは、今と同じく `UserRound` アイコン
- 未設定時の「プロフィール設定」の分岐はそのまま

**設定画面（`app/settings/page.tsx`）**

- 「退会」カードのすぐ上に「ログアウト」カードを足す。中身は今の `signOutAction` のフォームで、ボタンの文言は「ログアウト」

## エラー処理

- 未読件数の取得に失敗したときは、バッジを出さずにナビを表示する（件数は補助情報なので、画面全体を落とさない）。今の `AuthNav` と同じ扱い
- それ以外に新しく失敗しうる処理は無い

## テスト

既存テストの更新:

- `tests/layout/primary-nav.test.tsx`: 5項目になること、通知のバッジと `aria-label`、`/notifications` で通知がアクティブになること
- `tests/layout/mobile-event-fab.test.tsx`: 表示条件は変えない。判定を `getNavigationChrome` に移しても全ケースが通ること
- `tests/layout/layout-responsive.test.tsx`: 「固定ナビに本文・フッターが隠れない」の検証を、`BottomNavSpacer` 側に移す
- `tests/account/auth-nav-profile.test.tsx`: 設定ボタン（アバター＋「設定」、`/settings`）、ベルとログアウトが無いこと
- `tests/account/navigation-visibility.test.ts`: `getNavigationChrome` の境界（未ログイン、集中画面、`/events`・`/plans` だけ FAB、共有リンク `/s/`）

新規:

- `BottomNavSpacer` が `bottomInset` に従って出たり消えたりすること
- 設定画面にログアウトのフォームがあること

実ブラウザ確認（visual-qa）: スマホ375px と PC幅で、ホーム・イベント一覧・通知・設定・作成画面を見る。未読ありと0件の両方。

## スコープ外

- 通知画面そのものの中身
- 下部ナビへの6項目目の追加（将来足すときは「メニュー」方式を検討）
- PCのヘッダー・ナビ行の配置変更（今の位置のまま）
