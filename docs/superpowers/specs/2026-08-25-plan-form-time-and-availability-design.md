# 候補日時選択・進行表の時刻UIと空き状況表示の刷新

## 背景

`/events/[eventId]/plans/new`(候補日時選択、`components/plan/plan-form.tsx`)と `/plans/[planId]/timetable`(進行表、`components/plan/plan-timetable-form.tsx`)の画面レビューから、以下の指摘が出た。

1. 「参加者全体の空きやすさ」セクションの空き状況が、カレンダー上で視覚的にわかりにくい(色分けの粒度が粗く、参加者が少ないとほぼ同じ色になる)
2. 候補日時の開始/終了時刻(`TimeSelect`、時・分それぞれ独立ドロップダウン)が使いにくい
3. 進行表の開始/終了時刻(ネイティブ `<input type="time">`)は、タップ時にブラウザ標準のピッカーが出て周囲のデザインと統一感がない
4. 月選択パネル(`CalendarPicker` 内、年/月のセレクト)が開いたままになり、選択しても閉じない
5. 「謎解きテンプレート」ボタン群が、日付カレンダーの上に置かれていて配置が不自然
6. 「参加者全体の空きやすさ」という文言の「空きやすさ」という言い回しが不自然

ブレインストーミングの過程で、実際に動くプロトタイプ(Design Canvas)を作りながら方向性を検証した。検証の結果、時刻入力は新規の時計型UIに統一し、進行表にも同じ部品を使うことにした(統一感を優先)。

## 目的

- 開始/終了時刻の入力を、候補日時選択・進行表・回答期限の3箇所で共通の新規UIコンポーネントに統一する
- カレンダー上の空き状況の色分けを、「何人の予定が重なっているか」を軸にした直感的な表現に置き換える
- 細かい UX の粗さ(月選択が閉じない、テンプレートの配置、文言)を合わせて直す

## スコープ

**対象**

- 候補日時選択フォーム(`components/plan/plan-form.tsx`)の `TimeSelect`(開始/終了時刻、回答期限時刻)・`CalendarPicker`(月選択パネル、空き状況の色分け)・謎解きテンプレートの配置
- `components/plan/group-availability-calendar.tsx`(見出し文言、日次集計ロジックの受け渡し)
- 進行表フォーム(`components/plan/plan-timetable-form.tsx`)の開始/終了時刻
- 空き状況 API(`app/api/events/[eventId]/availability/route.ts`)と日次集計ロジック(`lib/domain/plan/group-availability.ts`)

**対象外**

- イベント作成・編集フォーム(`components/event/`)。時刻項目自体が存在しないため対象外
- リマインダー設定(`reminderUnitOptions`)。絶対時刻ではなく相対オフセット(分前/時間前/日前)の入力であり、時刻UIの対象外
- カテゴリ差し色機能(既存実装、本specとは無関係)

## 設計

### 1. 時刻入力コンポーネント(新規): タップで展開する時計ダイヤル

新規コンポーネント `TimeDialPicker` を作り、`TimeSelect`(候補日時の開始/終了・回答期限)と `plan-timetable-form.tsx` の開始/終了時刻をこれに置き換える。

**通常表示(折りたたみ)**

- 「🕐 開始 19:00」のようなチップボタン1つ。時刻を数字のまま見せる。ネイティブ `<input type="time">` は使わない
- 進行表の「終了(任意)」だけは、未設定の間「+ 終了を設定」という点線の丸ボタンを出す。押すと時計が展開し、以降は他のチップと同じ「終了 20:00」表示になる。展開中に「未設定に戻す」を押すと、また「+ 終了を設定」に戻る
- 候補日時の開始/終了、回答期限は必須項目なので、この「未設定」状態は持たない

**展開表示**

- チップをタップすると、その直下に円形の時計ダイヤルが展開する(片方だけ開くアコーディオン式。開始を展開中に終了をタップすると、開始は閉じて終了が開く)
- ダイヤル上部に「19」「:」「00」の2つの数字ボタン(時・分)があり、タップした方がハイライトされ、輪の目盛りがそのモード(時=24分割、分=5分刻み12分割)に切り替わる
- 輪の外周のハンドルをドラッグすると値が変わる。時モードは24時間を1周、分モードは60分を1周、5分刻みでスナップする
- 「完了」ボタンでダイヤルを閉じ、チップ表示に戻る

**実装メモ**

- ポインタ操作(`pointerdown`/`pointermove`/`pointerup`)でドラッグ角度→時刻を計算する。角度からの分算出、24時間/60分の目盛り生成、時/分モードの切り替えは、ブレインストーミング中に作成したプロトタイプ(Design Canvas、`OptionH.dc.html`/`OptionI.dc.html` 相当)のロジックをそのまま踏襲する
- 新規コンポーネントのため `"use client"` になる。既存の `MadoiSelect` と同様、フォーム送信用の値は隠し `<input>` で持たせる
- 5分刻み(`STEP = 5`)

### 2. カレンダー上の空き状況表示

**現状**: `CalendarPicker` の `availabilityTone`(`plan-form.tsx:349-350`)が、日ごとの平均空き率(`averageAvailableCount / participantCount`)を3段階の色(`bg-moss/20` / `bg-skywash/72` / `bg-clay/12`)で塗っている。粒度が粗く、参加者が少ないとほとんどの日が同じ色になる。

**変更後**: 「何人の予定が重なっているか」を軸にした4段階に置き換える。

| 状態 | 色 | 優先度 |
|---|---|---|
| 予定なし(全員空き) | 色なし(現状の `bg-surface`) | — |
| 一人だけ予定あり | `skywash` 45%不透明度 | 低 |
| 複数人予定あり | `skywash` 85%不透明度 | 中 |
| 誰か1人でも終日予定あり | `subtle` 28%不透明度 + `subtle` 枠線 | 最優先(他の条件より常に優先して表示) |

- 新規カラートークンは追加しない。既存の `skywash`(情報面)と `subtle`(装飾専用、テキストには使わない)の不透明度のみで表現する
- 赤系(`clay`、警告色)は使わない。「予定が入っている」ことは警告ではなく単なる状態であり、「終日」は`clay`の代わりに`subtle`(グレー)で「使えない」ことを直感的に示す
- 「終日」の判定はサーバー側で行う必要がある。ある参加者について、その日の全スロット(15分刻み96個)が連続して busy であることをもって「終日相当」とみなす(Googleカレンダーの終日イベントは `freeBusy.query` 側で丸1日ぶんの busy レンジとして返ってくるため、新しい判定ロジックを追加しなくても既存のスロットデータから導出できる)

**データフローの変更**

`lib/domain/plan/group-availability.ts` の `buildAvailabilitySlots` はスロット単位の `availableCount`(空き人数)のみを返しており、「誰が」busy かの情報を持たない。「一人/複数人/終日」を判定するには参加者ごとの busy 状態が必要なため、以下を追加する。

- `buildAvailabilitySlots` に、参加者ごとの busy 状態を保持した中間データ(`busyByParticipant`)から、日付ごとの `{ maxBusyCount: number, allDayBusyCount: number }` を集計する処理を追加する(`maxBusyCount` はその日のどこかの時間帯で同時に busy だった人数の最大値、`allDayBusyCount` はその日 96 スロット全部が busy だった参加者の数)
- `app/api/events/[eventId]/availability/route.ts` のレスポンスに、日付ごとの集計値を追加する(既存の `slots` 配列とは別に、または `slots` から `GroupAvailabilityCalendar` 側で導出できるようにする。既存の `connectedCount`/`memberCount`/`slots` の形はそのまま残す)
- `components/plan/group-availability-calendar.tsx` の `summarizeDailyAvailability`(49-63行目)を、上記の日次集計を使って `{ maxBusyCount, allDayBusyCount }` を返す形に置き換える
- `CalendarPicker` の `availabilityTone` 計算(`plan-form.tsx:349-350`)を、この節冒頭の表のロジックに置き換える

### 3. 月選択パネルの自動クローズ

`CalendarPicker` の `monthPickerOpen`(`plan-form.tsx:258`)について:

- 年または月の `MadoiSelect` で値を選んだら、`monthPickerOpen` を `false` にする(`onChangeMonth` 呼び出し後に閉じる)
- パネル外をクリック/タップしたときも閉じる。既存の `MadoiSelect` が持つ外側クリック検知(`components/ui/client.tsx:248-257`)と同じパターンを、月選択パネルのラッパー要素にも適用する
- 明示的な「閉じる」ボタンは追加しない(上記2つで用が足りるため)

### 4. 謎解きテンプレートの配置

現状、`eventCategory === "nazotoki"` のときのテンプレートボタン群(`plan-form.tsx:733-749`)は、日付カレンダー(`CalendarPicker`)より上に置かれている。これを「時刻」セクション(新しい `TimeDialPicker` の開始/終了チップ)の直上に移動する。

- 「候補日を選択」(カレンダー)→「時刻」の見出し→謎解きテンプレート→開始/終了チップ、という順序にする
- テンプレートボタンを押したときの挙動(`applyTemplateTime`、`plan-form.tsx:625-628`)は変更しない。開始時刻をテンプレートの値にし、終了時刻は `defaultDurationMinutes` を加算した値にする

### 5. 文言修正

`components/plan/group-availability-calendar.tsx:135` の見出し「参加者全体の空きやすさ」を「参加者全体の空き状況」に変更する。「空きやすさ」は「〜しやすい」という傾向を表す言い方だが、実際に見せているのは「今どれだけ空いているか」という状態なので、「状況」の方が意味に合う。

## 実装対象ファイル

- 新規: `components/plan/time-dial-picker.tsx`(時計ダイヤルの新規コンポーネント、`"use client"`)
- `components/plan/plan-form.tsx`(`TimeSelect` を `TimeDialPicker` に置き換え、`CalendarPicker` の `availabilityTone` と `monthPickerOpen` 挙動、謎解きテンプレートの配置)
- `components/plan/plan-timetable-form.tsx`(開始/終了時刻を `TimeDialPicker` に置き換え、終了の「未設定」トグルを追加)
- `components/plan/group-availability-calendar.tsx`(見出し文言、`summarizeDailyAvailability` の集計ロジック)
- `lib/domain/plan/group-availability.ts`(日次の `maxBusyCount`/`allDayBusyCount` 集計を追加)
- `app/api/events/[eventId]/availability/route.ts`(レスポンスへの集計値追加)

## テスト方針

- `TimeDialPicker` 単体: 時/分モードの切り替え、ドラッグでの値変更(5分刻みへのスナップ)、チップの展開/折りたたみ、フォーム送信用の値が正しく反映されることをテストする
- `lib/domain/plan/group-availability.ts`: `maxBusyCount`/`allDayBusyCount` の集計が、複数参加者・複数busyレンジのケースで正しく計算されることをユニットテストで確認する
- `CalendarPicker` の色分け: 予定なし/一人/複数人/終日それぞれのケースで正しいクラスが付くことを確認する
- `plan-timetable-form.tsx`: 終了時刻の「未設定」トグルが正しく動作し、未設定のままフォーム送信すると `end_time` が送られないことを確認する
- 実機確認: 375px幅で候補日時選択・進行表それぞれを操作し、時計ダイヤルの操作感・月選択の自動クローズ・テンプレートの配置を目視確認する
