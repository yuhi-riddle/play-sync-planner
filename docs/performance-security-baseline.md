# 性能・セキュリティ変更前ベースライン

記録日: 2026-07-19

この記録は、DB権限と画面の取得処理を変更する前の状態を固定する。数値はソースコードの静的確認による。実行中のDB計測は、接続先と認証済みの計測用データがこの作業環境にないため行っていない。

## 主要画面の取得

| 画面 | DB呼び出し数 | 初回取得行数 | 根拠 |
| --- | ---: | --- | --- |
| `/connections` | 9〜10 | 上限なし | 招待3件、ブロック1〜2件、つながり5〜6件。共有イベントと候補者を全件取得する。 |
| `/plans` | 2 | 上限なし | 参加イベント一覧1件と、対象イベントの計画・候補日・回答を入れ子で全件取得する。 |
| `/events/[eventId]` | 5〜12+ | チャットのみ最大50件、他は上限なし | 基本情報、参加者数、招待リンク、参加判定、チャット3件、主催者時は招待候補7件以上を取得する。 |

DB応答時間と実際の返却行数は未測定。試行コマンドは実行していない。理由は、現時点では専用の計測スクリプト、隔離DB、大量データ、認証済みの計測条件が用意されていないためである。後続タスクで同条件を整えた上で実測する。

## `createSupabaseAdminClient` の利用ファイル

許可リスト特性テストは、`app` と `lib` 以下の TypeScript / TSX を再帰走査し、次の18ファイルと一致することを確認する。

1. `app/api/cron/notifications/route.ts`
2. `app/api/events/[eventId]/availability/route.ts`
3. `app/connections/page.tsx`
4. `app/events/[eventId]/page.tsx`
5. `app/invites/[token]/page.tsx`
6. `app/plans/[planId]/settlement/page.tsx`
7. `app/plans/page.tsx`
8. `app/s/[token]/answer/page.tsx`
9. `app/s/[token]/settlement/page.tsx`
10. `lib/actions/answers.ts`
11. `lib/actions/calendar.ts`
12. `lib/actions/connections.ts`
13. `lib/actions/event-members.ts`
14. `lib/actions/event-messages.ts`
15. `lib/actions/plans.ts`
16. `lib/actions/settlements.ts`
17. `lib/google-calendar/access-token.ts`
18. `lib/supabase/server.ts`

この一覧は変更前の観測結果であり、現時点で通常画面の利用を正当化するものではない。後続の権限強化では、管理権限が必要な処理を限定したサーバー側関数へ移し、この許可リストを縮小する。
