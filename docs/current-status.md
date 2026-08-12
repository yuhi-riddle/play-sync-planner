# Madoi 現在の実装状況

最終更新: 2026-07-29

このドキュメントは、いま何ができていて、何が残っているのかを固定するための棚卸しです。
小さな改善を増やし続けるのではなく、次の区切りに向けて必要な作業だけを見えるようにします。

## 現在地

Phase 1 は完了済みです。

現在の実装は、当初の Phase 1 を超えて、Phase 2 の Google Calendar 連携と Phase 3 の清算機能まで一部進んでいます。

## 実装済み

### Phase 1: 日程調整

- Supabase Auth による Google ログイン
- ログイン前の利用規約・プライバシーポリシー同意と、同意日時・版数の保存
- イベント作成、編集、一覧、詳細
- イベント一覧の状態・カテゴリ・表示順・10/20/50件表示
- イベント一覧カードは状態1つ・イベント名・日時・場所・参加人数だけに絞って表示
- 日程が終了・中止になっても清算が残るイベントは「清算待ち」に残し、日程と清算の両方が終わったイベントだけを「完了」に表示
- 複数の日程調整があるイベントは、今後いちばん近い確定日時を一覧へ表示し、すべての日程が終わるまで完了扱いにしない
- 中止時に清算が始まっていないイベントは「中止」へ移し、清算中または未清算のものだけを「清算待ち」に残す
- イベント作成途中の下書き保存と、ホームまたは下書き一覧からの明示的な再開・破棄
- 初回ニックネーム確認、プロフィール画像設定、設定画面での変更
- 初回プロフィールが未設定の場合のオンボーディング導線と、スマホでも見えるプロフィール設定表示
- ヘッダーのプロフィール入口と一般設定を分離し、ホームの挨拶は保存済みニックネームを優先
- 参加予定の作成、編集
- 候補日時登録
- 回答期限登録
- 共有リンク経由の参加者管理
- 未ログインでも回答できる公開回答ページ
- 日程回答
- 回答状況の集計
- 日程確定
- 利用規約、プライバシーポリシーのドラフトページ

### Phase 2: Google Calendar

- Google Calendar 連携、解除
- 空き状況集計用の `calendar.freebusy` 権限要求と、権限不足時の再連携導線
- 設定画面でのログイン中メールアドレス表示と、別アカウント利用時の案内
- Google Calendar 用 OAuth コールバック
- Calendar トークンの暗号化保存
- Google Calendar の予定取得
- 候補日時作成時の Google Calendar 予定表示
- 回答者がログイン済みかつ連携済みの場合の、回答画面での予定表示
- 確定した日程を主催者の Google Calendar に作成し、連携済み参加者へ招待するボタン
- ホームでの選択日ごとの Madoi 予定と Google Calendar 予定の表示
- カレンダーでの、自分が参加している Madoi 候補と Google Calendar 予定の重ね表示
- 未回答者向け複数リマインダー設定
- 回答期限前リマインドの任意タイミング複数設定
- リマインド文面生成
- 手動送信済みログ

### 共同調整とつながり

- 参加済みの共通イベントをきっかけにした片方向フォロー
- フォロー済みユーザーのお気に入り登録と、ブロックによる関係解除
- フォロー・お気に入り・ブロックの使い分け説明と、件数付きタブ表示
- ブロック中ユーザーの一覧表示と解除。解除時に以前のフォロー・お気に入りは復元しない
- 過去に同じイベントへ参加した人と、フォロー中・お気に入りのつながりを候補にするアプリ内招待
- 招待の承諾・辞退と、承諾時のイベント参加処理
- 参加済みメンバーだけが読めるイベント内チャット
- 主催者かつ日程調整中だけが見られる、参加者全体の空き状況集計
- 日程を再調整するための、確定日時・回答・参加状況のリセット

### Phase 3: 清算

- 立替支払い登録
- 清算支払い開始前の立替支払い編集、削除
- 均等割り
- 個別割り
- 重要メモ
- 清算結果の自動計算
- 予定詳細、ホームでの清算ステータス表示
- 清算ごとの支払い方法、支払いURL
- 共有リンクから見られる公開清算ページ
- 参加者による支払い記録
- 一部支払い
- 支払い履歴表示
- 主催者による受け取り確認
- 清算進捗表示
- 清算完了表示
- 支払い依頼文面の生成
- 受け取り確認依頼文面の生成
- 清算リマインドの手動送信済みログ

### サイト内通知

- 通知一覧
- ヘッダーの未読通知件数
- ホームの対応事項表示
- ホームの対応事項フィルター
- 未読、既読管理
- `/notifications` の未読・既読フィルター
- 通知の重複作成防止
- Vercel Cron 用の通知生成API
- 日程回答送信時の主催者向け即時通知
- 複数リマインド設定に沿った回答期限前通知
- 候補日時、回答期限入力時のスムーススクロール

### モバイルナビゲーション・イベント一覧の磨き込み

- スマートフォン通常画面の固定下部ナビゲーションと、集中操作画面での非表示
- ホームの日付7列を320px相当でも横にはみ出さない表示
- つながり画面のスマートフォン用ドロップダウン
- イベント一覧の「参加者待ち」「日程作成待ち」「回答待ち」「開催待ち」「清算待ち」表示
- イベント詳細からGoogleマップで現在地からの経路を開く導線
- ホームの「次の予定」強調表示
- 清算画面の合計金額の主役化(清算残額を主要指標として表示)
- 通知一覧の未読・既読の面とバッジトーンによるメリハリ

### 共有リンクの無効化・再発行

- 主催者が日程回答・公開清算の共有リンクを無効化できる(`share_links.status`)
- 無効化したあと、新しいリンクを再発行できる。古いリンクは使えなくなる
- 無効化されたリンクは、回答ページ・公開清算ページとも「無効化されています」と案内する
- 回答送信と公開清算からの支払い記録も、無効化されたトークンを受け付けない
- イベント招待リンク(`event_invite_links`)の無効化・再発行は以前から実装済み

### 退会(アカウント削除)

- 設定画面から退会の手続きへ進める。表示名の入力による確認を必須にしている
- 未完了の清算がある場合は件数を警告する(退会自体は止めない)
- 消すもの: つながり(フォロー・お気に入り・ブロック)、アプリ内招待、通知、イベントの下書き、Google Calendar連携、プロフィール画像とニックネーム
- 残すもの: イベント・日程・立替・清算の記録、同意記録、日程調整の参加者名(清算の相手が分からなくなるため)
- 表示名は `profiles` と `event_members` で「退会したユーザー」に置き換える
- `auth.users` は削除しない。`events.owner_user_id` が `on delete cascade` のため、消すと他の参加者の清算記録まで巻き添えになる
- 再ログインは `user_metadata.withdrawn_at` を見て middleware で遮断する(追加のDB問い合わせは発生しない)
- プライバシーポリシーに「8. 退会と削除」を追加した

### イベントの複製

- イベント詳細の「このメンバーでもう一度」から複製できる
- 参加済みなら主催者でなくても複製でき、複製した人が新しいイベントの主催者になる
- 引き継ぐもの: カテゴリ、タイトル(「（コピー）」を付ける)、URL、場所、住所、メモ、参加済みメンバー
- 引き継がないもの: 日付、金額、定員、進行状態、日程調整、立替、清算
- 複製後はイベント情報の編集画面へ送る

### 持ち物・役割の分担リスト

- イベント詳細に、当日までの持ち物と担当を書き出せるリストを追加
- 担当者は参加済みメンバーから選ぶ。担当なしのままでも登録できる
- 完了件数を進捗バーで表示する。未完了のものが先に並ぶ
- 参加済みメンバーだけが編集できる(RLSは `is_event_member` を再利用)
- 中止したイベントでは編集できない

### PWA(ホーム画面に追加)

- `app/manifest.ts` を追加。`display: standalone` でホーム画面から単独アプリとして開ける
- アイコンは `app/icon.svg` から 192/512px のPNGと maskable 版を生成し `public/icons/` に置いた
- standalone にするとブラウザの戻るボタンが無くなるため、下部ナビを隠す集中画面
  (イベント作成・イベント編集・日程調整作成・日程調整編集・日程確定)すべてに戻る導線を追加した
- プッシュ通知は含まない(後続Phaseで扱う)

### 品質改善: 土台

- `next` を `15.5.22` に更新した。`npm audit --omit=dev` の high 3件のうち、next本体の脆弱性は解消。
  postcss・sharpはnext内部で固定バージョンを指定しているため残っている(next側の対応待ち。実際の攻撃面はビルド時ツールに限られ、
  このアプリはpostcssで外部入力を処理せず、next/imageも使っていないため実害は低いと判断)
- `npm run typecheck`(`tsc --noEmit`)を追加した
- `.github/workflows/ci.yml` を追加。push/PRで lint → typecheck → test → build を自動実行する
- `next.config.ts` にセキュリティヘッダを追加: X-Content-Type-Options, X-Frame-Options: DENY,
  Referrer-Policy: strict-origin-when-cross-origin(公開清算リンクのトークン漏洩対策), Permissions-Policy,
  Content-Security-Policy-Report-Only(まだ強制はしない)
- `app/robots.ts` で `/s/` `/invites/` `/api/` `/auth/` をクロール禁止にした
- `app/s/[token]/layout.tsx` と `app/invites/[token]/page.tsx` に `robots: { index: false }` を追加(robots.txt無視のクローラ対策)
- Vercel Cronの配線は見送った。`docs/gas-notification-schedule.md` に既にGASから1時間ごとに呼び出す手順があり、
  Vercel無料プランのcron頻度制限を回避する目的で用意されているため。vercel.jsonを追加すると二重実行になる

### 品質改善: 二重送信の遮断

- `components/ui.tsx` を分割した。`ui-server.tsx`(表示だけ、hooks無し)と `ui-client.tsx`(操作系、`"use client"`)に分け、
  `ui.tsx` は再エクスポートのバレルにした。import元(`@/components/ui`)は変えていないので、既存の48ファイルは無修正で通る。
  以前は `Card` を1つ使うだけでファイル全体の `"use client"` が付き、hooksを使わない表示系までクライアント境界になっていた
- `SubmitButton` に `useFormStatus` を追加し、送信中は自動で無効化・`aria-busy`・ラベル差し替え(`pendingChildren`)ができるようにした。
  `variant`(primary/secondary)・`icon`・`className`・`ref` 転送にも対応
- 二重送信されやすい送信ボタンを `SubmitButton` に置き換えた: 公開清算ページの支払い記録、主催者側の支払い記録・受け取り確認、
  立替登録、日程確定
- 満額の二重送信は migration 021 のDBトリガーで既に防げているが、分割払いの重複はUI側の対策が無いと素通りするため、この対応が必要だった
- 冪等キーによる根本対応(DBマイグレーション)は今回のスコープ外。必要になれば別途相談する

### 品質改善: エラーがユーザーに届くようにする

- Next.js は本番ビルドで Server Action の未処理例外メッセージをクライアントに渡さないため、
  丁寧に書いた日本語エラーがすべて汎用エラーに化けていた問題に対応した
- `lib/domain/action-state.ts` に共通の `ActionState`(`{status, message, fieldErrors}`)を追加。
  `ProfileActionState` / `AccountActionState` はこの型を再エクスポートする形に統合した
- `createPlanAction` / `updatePlanAction` / `createExpenseAction` / `updateExpenseAction` を
  `safeParse` + `ActionState` の返り値方式に移行し、`PlanForm` / `ExpenseForm` が `serverError` として
  既存の `Alert` に表示するようにした(throw方式だとエラー時にウィザードの入力内容が消えていた)
- `lib/actions/connections.ts` のフォロー・お気に入り・ブロック・招待系7関数も同様に返り値方式へ移行し、
  `connection-list.tsx` / `event-invite-candidates.tsx` / `received-event-invitations.tsx` が
  `result.status` を見て表示を切り替えるようにした
- `app/error.tsx` / `app/global-error.tsx` が `error.digest` を画面に小さく表示し、`console.error` に原因を残すようにした
- セグメント単位のエラー境界を追加: `app/events/[eventId]/error.tsx`(イベント一覧へ戻れる)、
  `app/plans/[planId]/error.tsx`(日程調整一覧へ戻れる)、`app/s/[token]/error.tsx`(ゲスト向けなので戻り先リンクなし)
- トークン自体が存在しない場合の404を専用文言にした: `app/s/[token]/not-found.tsx` / `app/invites/[token]/not-found.tsx`。
  「このリンクは無効か、期限が切れています」という文言で、F2の「無効化されています」(無効化済みリンク)とは区別している
- `connection-list.tsx` / `event-chat.tsx` / `received-event-invitations.tsx` / `event-invite-candidates.tsx` の
  client側 `catch` に `unstable_rethrow(cause)` を追加。将来 Server Action に `redirect()` が入っても、
  クライアント側の汎用catchが握りつぶさないようにするための保険

### 品質改善: 体感速度

- `lib/supabase/server.ts` の `createSupabaseServerClient` / `getCurrentUser` / `getCurrentUserId` を
  `React.cache()` でラップした。1リクエスト内(レイアウトの `AuthNav` とページ本体など)で複数回呼ばれても
  `auth.getUser()` は1回に集約される。ただし `React.cache()` の重複排除は実際のServer Componentレンダリング文脈
  (内部のAsyncLocalStorageベースのディスパッチャ)に依存するため、vitest単体では検証できない
  (`node -e` でcache()単体の挙動を確認し、テストは「ラップしても壊れていないこと」の回帰確認にとどめた)
- `AuthNav` の `profiles` 取得は意図的に変更していない。`onboarding_completed_at` はテスト上もDB値が
  主たる情報源になっており、`user_metadata` は補助的なフォールバックに過ぎないため、削るとメタデータ未同期の
  既存ユーザーで導線が壊れる恐れがある
- `/plans`(カレンダー)ページのクエリに月範囲フィルタを追加した。`candidate_dates!inner` と
  `monthRangeInTokyo(currentMonth)` の `gte`/`lt` で、表示月に候補日が無いplanごとfetchしないようにした
  (以前は参加済み全イベントの全候補日・全回答をlimitなしで取得していた)
- `lib/actions/answers.ts` に `revalidatePath("/")` と `revalidatePath("/plans/{planId}")` を追加した。
  回答送信後にこの2つが無効化されていなかったため、主催者が開いたままのタブがルーターキャッシュ経由で
  古い表示のままになりうる抜けだった
- `lib/actions/profile.ts` の重複した `revalidatePath("/settings")` を削除した(直前の
  `revalidatePath("/", "layout")` がルートレイアウト配下の全ページを無効化するため冗長だった)
- 見送った項目: `events/[eventId]/page.tsx` の `admin.auth.admin.getUserById` によるN+1は、
  対象がすでに小さく絞られた候補ユーザーのみかつ並列実行済みのため、`listUsers()`(全件取得+ページング)へ
  置き換えると逆にユーザー数が増えたときに悪化する。計画にあった「直列awaitのPromise.all化」対象箇所は、
  別コミット(イベント複製・分担リスト追加)で構造が変わり、2つのPromise.allの間に本物のデータ依存
  (2つ目が1つ目の結果の `currentUserId`/`isOwner` を使う)ができていたため統合できなかった

### 品質改善: アクセシビリティ

- `lib/domain/home-calendar.ts` に `buildDayAriaLabel()` を追加した。カレンダーの各日セルは
  調整中/確定/Google/重複の色つきドットが `aria-hidden="true"` で、日付だけしかラベルが無かったため、
  「7月15日、調整中の予定あり、確定した予定あり」のように種別を文章化してから
  `home-month-calendar.tsx` / `adjustment-calendar-view.tsx` の `aria-label` に差し込んだ
  (両カレンダーの日オブジェクトの形が違うため、正確な件数ではなく種別の有無で統一している)
- 祝日は `isHoliday` として同じ関数に渡し、ラベル内に「(祝日)」を付けた
- `plan-form.tsx` の候補日カレンダーの `aria-label` に、Googleカレンダーの既存予定件数を追記した
- 両カレンダーの凡例(上部の色ドット+テキストの説明行)に `aria-hidden="true"` が付いていなかった箇所を
  日セル側のドットと揃えた
- `components/ui-server.tsx` / `ui-client.tsx` の共有プリミティブを `focus:` から `focus-visible:` に統一した。
  マウスクリックではリングを出さず、キーボード操作時だけ出す。`app/globals.css` に `:focus-visible` の
  ベースライン(個別クラスが無い要素向けの保険)も追加した
- `eslint-plugin-jsx-a11y` の `recommended` を追加した。検出された7件は
  すべて `label-has-associated-control` の誤検知(`MadoiSelect` という独自comboboxをネイティブcontrolとして
  認識できない/デフォルトdepth=2を超えてネストしたラベルテキスト)だったため、
  マークアップを崩さず `controlComponents` / `depth` のルール設定で解消した

### 品質改善: 保守性・テスト

- `lib/actions/settlements.ts`(725行)には実行テストが無かった。`deleteExpenseAction` /
  `recordPublicSettlementPaymentAction` を通した回帰テストを追加し、
  「未払いのsettlementsだけをdeleteする」「清算支払い開始後は立替を変更できない」
  「トークンの計画に属さないsettlementIdは拒否する(唯一の未認証書き込み経路)」の3点を固定した。
  いずれも既存実装は正しく動いており、バグ修正ではなくテストの追加
- 清算まわりの金額表記を「1,000円」に統一した(ユーザー判断)。`lib/format.ts` に `formatYenText` を追加し、
  `lib/domain/settlement.ts` / `public-settlement-summary.tsx` / `settlement-confirmation-queue.tsx` /
  `paypay-action-panel.tsx` の重複実装と、主催者向け清算ページの `formatYen`(￥表記)をこれに揃えた。
  使われなくなった `formatYen` は `lib/format.ts` から削除した
- カレンダー系コンポーネントに22行重複していたヘルパーを共通化した: `lib/domain/calendar-month.ts`
  (`parseMonth` / `monthParam` / `moveMonth` / `monthLabel` / `dateLabel`)、`lib/calendar-styles.ts`
  (`weekdayClass` / `dayCellClass`)、`lib/google-calendar/free-busy-items.ts`(`googleItemsFromResponse`)。
  `dateLabel` だけ年表示の有無が画面ごとに違ったため `includeYear` オプションで吸収し、表示は変えていない
- `lib/japanese-holidays.ts` に `HOLIDAY_DATA_VALID_UNTIL`(`2027-11-23`)を追加し、
  開発時のみそれ以降の日付で `console.warn` するようにした。範囲外の日付は例外を投げず `false` を返す仕様を
  テストで固定した。README.mdに年次更新が必要な旨を追記した
- `@vitest/coverage-v8` を追加し、`npm run test:coverage` で計測できるようにした(閾値は設定しない)。
  現状値: Statements 65.35% / Branches 76.02% / Functions 76.91% / Lines 65.35%
  (計測時点。`lib/actions/*` の一部ファイルはテストが薄く0%に近いものもある)

## 残っている作業

今のビルドは、機能面ではかなり進んでいます。
残っているのは、新機能を増やす作業というより「本番前に安心して使えるか」を確認する作業です。

### 必須

1. 実ブラウザで一連の流れを確認する
   - イベント作成
   - 参加予定作成
   - 候補日時登録
- 共有リンク回答
- 主催者自身の回答導線
   - 日程確定
   - Calendarに作成して招待
   - 立替支払い登録
   - 公開清算ページ
   - 支払い記録
   - 主催者の受け取り確認
   - 清算完了
   - 通知の未読・既読切替

2. 本番用の設定を確認する
   - Supabase マイグレーションが順番どおり適用されていること。
   - RLS と API key の扱いが正しいこと。
   - Google OAuth のリダイレクト URL が正しいこと。
   - Google OAuth のスコープが実装内容と合っていること。
   - Google Calendar 連携を使う場合は、`calendar.events` と `calendar.freebusy` スコープで再連携できること。
   - `.env.local` と本番環境変数がそろっていること。
   - Vercel Cron と `CRON_SECRET` の扱いを決めること。

3. 利用規約・プライバシーポリシーの最終確認をする
   - 問い合わせ先を決める。
   - Google Calendar の取得情報、通知、清算、支払いURLの扱いが問題ないか確認する。

4. 公開前の最終コマンド確認をする
   - `npm.cmd test`
   - `npm.cmd run build`

### できれば確認する

- 画面文言と導線の違和感
- スマホ幅での入力しやすさ
- 通知文面が分かりやすいか
- 清算ページで、支払う側・受け取る側が迷わないか

### 後続Phaseで扱うもの

次の区切りを出すうえでは、以下はブロッカーにしません。

- 外部決済 API 連携
- 支払い依頼の自動送信
- 証拠画像アップロード
- 領収書やスクリーンショットの OCR
- チケットサイト連携
- 自動日程最適化
- LINE 連携
- Discord 連携
- メール送信
- PWA プッシュ通知
- アプリ内送金
- 複雑な組織、チーム権限管理

## おすすめの次の作業順

1. `docs/release-checklist.md` に沿って、ローカル確認を進める。
2. ユーザーがブラウザ確認を指示したタイミングで、実ブラウザ確認を行う。
3. チェックリストで見つかった問題だけを直す。
4. 本番環境変数、Google OAuth、Vercel Cron の設定をそろえる。
5. 機能追加はいったん止めて、チェックポイントを切る。

## 手動確認シナリオ案

一連の流れを確認するときの最初のたたき台です。

1. Google でログインする。
2. イベントを作成する。
3. イベントに参加予定を作成する。
4. 候補日時を複数追加する。
5. 候補日時を選ぶ画面と調整カレンダーで Google Calendar の予定が見えることを確認する。
6. 共有回答リンクを別ブラウザ、またはシークレットウィンドウで開く。
7. 日程回答を送信する。
8. 予定詳細で回答状況を確認する。
9. 候補日時を確定する。
10. 予定詳細の `Calendarに作成して招待` から、主催者のGoogle Calendarに予定を作れることを確認する。
11. 立替支払いを追加する。
12. 清算結果を確認する。
13. 支払い依頼文面をコピーする。
14. 公開清算リンクを開く。
15. 一部支払いを記録する。
16. 主催者の清算ページで、受け取り確認待ちに表示されることを確認する。
17. 主催者として受け取り確認する。
18. 全員分が終わると清算完了が表示されることを確認する。
19. 通知画面で未読・既読を切り替えられることを確認する。

## リリース前チェックリスト案

- [ ] `001_phase1_schema.sql` を適用済み。
- [ ] `002_calendar_integrations.sql` を適用済み。
- [ ] `016_legal_consents_and_event_drafts.sql` を適用済み。
- [ ] `017_connections_messages_and_invites.sql` を適用済み。
- [ ] `018_require_follow_for_favorites.sql` を適用済み。
- [ ] `019_user_profiles_and_avatars.sql` を適用済み。
- [ ] `003_plan_reminder_settings.sql` を適用済み。
- [ ] `004_plan_reminder_logs.sql` を適用済み。
- [ ] `005_settlement_core.sql` を適用済み。
- [ ] `006_settlement_payments.sql` を適用済み。
- [ ] `007_expense_important_notes.sql` を適用済み。
- [x] `008_settlement_reminder_type.sql` を適用済み。（`settlement_reminder_logs.reminder_type` の存在で確認）
- [x] `009_site_notifications.sql` は `013_repair_notifications_setup.sql` が代替済み。（009 を流すと `42P07 relation "notifications" already exists` になるが想定内。013 が 009 の内容を全部含む修復版）
- [x] `020_event_list_performance_and_atomic_block.sql` を適用済み。（RPC `list_owned_event_ids` の応答で確認）
- [x] `021_settlement_payment_total_guard.sql` を適用済み。
- [x] `022_share_link_revocation.sql` を適用済み。
- [x] `023_account_deletion.sql` を適用済み。
- [x] `024_event_tasks.sql` を適用済み。
- [x] `025_participant_settlement_payment_method.sql` を適用済み。
- [x] `026_legal_consent_app_metadata.sql` を適用済み。
- [x] `027_user_consents_no_delete.sql` を適用済み。
- [x] `028_plan_timetable.sql` を適用済み。
- [x] `029_event_list_search.sql` を適用済み。
- [x] `030_share_page_participant_rls.sql` を適用済み。（参加者のJWTで3件、他人のJWTで0件を確認）
- [x] `031_drop_guest_participant_type.sql` を適用済み。（2026-08-11）
- [ ] Supabase Project URL を設定済み。
- [ ] Supabase anon key を設定済み。
- [ ] Supabase service role key はサーバー側だけに設定している。
- [ ] Google Calendar client ID を設定済み。
- [ ] Google Calendar client secret を設定済み。
- [ ] Google Calendar redirect URI を設定済み。
- [ ] Calendar token encryption key を設定済み。
- [ ] Google OAuth を `External` / `In production` に設定し、テストユーザーを追加していない。
- [ ] Google OAuth のリダイレクト URI にローカル用 callback を登録済み。
- [ ] Google ログインと Calendar 連携で同じ OAuth Client を使う場合、Supabase auth callback も登録済み。
- [ ] Vercel Cron を使う場合、`CRON_SECRET` の設定方針を決めている。
- [ ] `npm.cmd test` が通る。
- [ ] `npm.cmd run build` が通る。
