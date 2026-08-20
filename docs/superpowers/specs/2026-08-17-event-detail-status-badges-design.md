# イベント詳細ページ 状態span の Badge 化 デザインspec

## 背景

Phase 5「イベント詳細ページの重複実装解消」（`9746767`）の最終ブランチレビュー（opus、`0d8d5f2..9746767`）で、スコープ外のMinor findingとして以下が記録された。

> `app/events/[eventId]/page.tsx` の状態表示span（`text-sm font-bold ...`）は、共有`Badge`コンポーネント（`components/ui/server.tsx`）を使わず生のクラスで実装されたまま。Phase 6向けに要フラグ。

本Phaseはこれを解消する。

対象は「参加者」セクションの`SectionHeading`の`action`プロップに渡している2つのspan（197〜207行目付近、Phase 5 Task 3で構造を`SectionHeading`化した際に残った内側の生実装）。

```tsx
<SectionHeading
  title="参加者"
  description={`参加済み ${memberCount ?? 0}人`}
  action={
    isEventTerminal ? null : canStartAdjustment ? (
      <span className="text-sm font-bold text-pine">日程調整の準備中</span>
    ) : (
      <span className="text-sm font-bold text-muted">参加者を募集中</span>
    )
  }
/>
```

ユーザーへビジュアルコンパニオンでBefore/Afterモックアップ（トーン案A: accent+neutral／案B: done+neutral）を提示し、「B（done+neutral）」の承認を得た。

## 対象範囲

`app/events/[eventId]/page.tsx` 1ファイルのみ。`components/ui/server.tsx`の`Badge`コンポーネント自体・既存の5トーン定義は変更しない。

**対象外**（ユーザー確認済み）: 同ファイル117行目付近の`progress.statusLabel`表示pill（`<span className="rounded-full border border-line px-3 py-1 font-bold text-pine">`）。`resolveEventProgress()`由来の多値のため、Badge化にはPhase 4の`eventDisplayStateTones`のようなトーン対応表の設計が別途必要。今回は対応しない。

## 変更内容

`components/ui/server.tsx`から`Badge`をimportし、2箇所を置き換える。

- 「日程調整の準備中」（`canStartAdjustment`が真のとき）→ `<Badge tone="done">日程調整の準備中</Badge>`
  - 現行`text-pine`の色味を維持しつつ、背景を`mist`（確定・完了の面）に。「オーナーが次のアクションに進める状態」を「完了に近い/準備が整った」トーンとして表現する。
- 「参加者を募集中」（それ以外、`isEventTerminal`でないとき）→ `<Badge tone="neutral">参加者を募集中</Badge>`
  - 現行`text-muted`のグレー系をそのまま`neutral`（`bg-sunken text-muted`）で踏襲。

条件分岐（`isEventTerminal ? null : canStartAdjustment ? ... : ...`）の構造は変更しない。`dot`propは使用しない（既定`false`）。

## 変更しないもの

- ページの構成・タブ構造・条件分岐ロジック
- `Badge`コンポーネント本体・5トーン定義（`components/ui/server.tsx`）
- `design/tokens.css` / `tailwind.config.ts`
- 117行目付近の`progress.statusLabel`pill

## 検証方法

1. `npm run typecheck`
2. `npx vitest run --reporter=dot`（既存テストに加え、Badge化後のレンダリング検証を追加）
3. `npm run build`
4. `npm run dev`でブラウザ実機確認: 「参加者」タブをオーナーでないユーザー視点で開き、`canStartAdjustment`真偽両方のケースでBadgeの見た目（背景色・テキスト）を確認
