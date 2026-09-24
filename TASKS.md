# TASKS（2026-09-23 セッション）

## A. 清算404 / #52・#53 事後レビュー
- [x] 本番DBで清算ページの select 2本を全件実行（エラーなし）
- [x] 本番をログイン状態で全13ページ確認（404なし）→ 再現せず、再現手順待ち
- [x] #52・#53 Codex事後レビュー（blockingなし、advisory 2件）
- [x] 再現手順なし → 解消済みとして閉じる
- [x] worktree `.claude/worktrees/settlement-404` の片付け

## B. Batch B（ナビ再設計）設計
- [x] 既存コード確認（primary-nav / mobile-event-fab / auth-nav / navigation-visibility / layout）
- [x] brainstorming（案A採用）
- [x] grill-me（設定ボタン=アバター＋設定、ログアウト=設定画面、判定統合=3つとも、PR2本）
- [x] 設計doc → sanitize-artifacts → commit（787002e、ユーザーレビュー待ち）
- [x] 実装計画 → sanitize-artifacts → commit（ユーザーレビュー待ち）
- [x] ユーザー承認 → PR #58 マージ（416e9ba）

## C. Batch B 実装 PR1（表示判定の統合）
- [x] Codex書き込みエラーの解消（TEMP除外設定＋所有者の是正）
- [x] 実装・GREEN・コミット（8ff322e）
- [x] 全テスト1482件・typecheck・lint・build・Codexレビュー（ship-ok）
- [x] PR #59（CI green）
- [ ] ログイン状態の実ブラウザ確認（ユーザー）
- [ ] マージ承認
