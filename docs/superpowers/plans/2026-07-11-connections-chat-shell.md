# つながり・イベントチャット・画面シェル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 過去の参加者を安全に再招待できるつながり機能、イベント参加者限定チャット、Calendar空き状況の期間限定共有、固定ヘッダーとモバイルFABを追加する。

**Architecture:** 一方向フォロー、お気に入り、ブロック、Madoi内招待を独立テーブルで持つ。イベントメッセージはイベント参加者に限定し、サイト内通知を使って新着を知らせる。Google Calendarの空き状況はサーバーで匿名集計するだけで保存せず、イベントが日程調整中の間に主催者だけが取得できる。

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase Postgres/RLS/Auth, Server Actions, Tailwind CSS, Lucide, Vitest.

## Global Constraints

- 既存の未コミット変更を戻さない。特に `lib/actions/plans.ts` の日時正規化は維持する。
- 新しい操作はMadoiのインライン確認・エラー表示を使い、ブラウザ標準の確認ダイアログを使わない。
- Calendarの予定名、場所、説明、個人別空き時間を他ユーザーへ返さない。FreeBusy結果はDBに保存しない。
- フォロー候補とMadoi内招待は、現在または過去に同じイベントへ参加したユーザーに限る。
- ブロックは、フォロー、Madoi内招待、将来のDM候補表示を両方向で止める。
- 自動スクリーンショット確認は行わない。ユーザーが依頼した場合だけ実施する。

---

## File Structure

- `supabase/migrations/017_connections_messages_and_invites.sql`: つながり、ブロック、お気に入り、Madoi内招待、イベントメッセージのテーブル、制約、RLS、security-definer関数。
- `lib/domain/connections.ts`: フォロー候補、相互フォロー、お気に入り順、ブロックの純粋関数。
- `lib/domain/event-chat.ts`: メッセージ本文の正規化・2,000文字制約。
- `lib/actions/connections.ts`: フォロー、お気に入り、ブロック、Madoi内招待のServer Actions。
- `lib/actions/event-messages.ts`: イベントメッセージ投稿と通知作成のServer Action。
- `components/connection-list.tsx`: つながり画面とイベント詳細の参加者行で共有する関係操作UI。
- `components/event-invite-candidates.tsx`: お気に入り、フォロー、最近の参加者を優先表示する主催者用招待UI。
- `components/event-chat.tsx`: イベント参加者だけが使うメッセージ一覧と投稿フォーム。
- `components/mobile-event-fab.tsx`: モバイルだけで表示するイベント作成FAB。
- `app/connections/page.tsx`: つながりの一覧と候補を表示する画面。
- `app/events/[eventId]/page.tsx`: 参加者、招待候補、チャットを統合する。
- `app/settings/page.tsx`: つながり画面への導線を追加する。
- `app/layout.tsx`: 固定ヘッダー、本文上余白、FABを追加する。
- `app/api/events/[eventId]/availability/route.ts`: 主催者・日程調整中だけに匿名集計を限定する。
- `lib/actions/confirm.ts`: 確定時にCalendar集計を閉じるイベント状態を維持する。
- `lib/actions/plans.ts`: 再調整開始時に既存の回答をリセットし、回答受付へ戻す。
- `app/plans/[planId]/page.tsx`: 主催者用の再調整開始導線を追加する。
- `app/terms/page.tsx`, `app/privacy/page.tsx`: 一般的なサービス規約構成へ全面改稿する。

## Task 1: 規約・ポリシーと固定画面シェル

**Files:**
- Modify: `app/terms/page.tsx`
- Modify: `app/privacy/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `components/mobile-event-fab.tsx`
- Test: `tests/mobile-event-fab.test.tsx`

**Interfaces:**
- Produces: `MobileEventFab`。`RootLayout` から常に描画し、対象外ページではクライアント側で非表示にする。

- [ ] **Step 1: Write the failing FAB tests**

```tsx
render(<MobileEventFab pathname="/events" />);
expect(screen.getByRole("link", { name: "イベントを作る" })).toHaveAttribute("href", "/events/new");

render(<MobileEventFab pathname="/events/new" />);
expect(screen.queryByRole("link", { name: "イベントを作る" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/mobile-event-fab.test.tsx`

Expected: FAIL because `MobileEventFab` does not exist.

- [ ] **Step 3: Implement the shell and legal pages**

```tsx
// components/mobile-event-fab.tsx
const hiddenPaths = ["/events/new", "/terms", "/privacy", "/login", "/consent"];
export function MobileEventFab({ pathname }: { pathname: string }) {
  if (hiddenPaths.includes(pathname) || pathname.includes("/edit")) return null;
  return <Link href="/events/new" aria-label="イベントを作る" className="fixed bottom-5 right-5 z-40 ...">...</Link>;
}
```

Set the header to `sticky top-0 z-30` and give the main container a top padding matching the fixed header height. Keep desktop page-header create buttons; use `sm:hidden` on the FAB. Rewrite terms using the sections `適用`, `アカウント`, `利用者の責任`, `禁止事項`, `サービスの変更`, `免責`, `規約の変更`, `問い合わせ`. Rewrite privacy using `取得する情報`, `利用目的`, `Googleの情報`, `共有範囲`, `外部サービス`, `安全管理`, `保存期間`, `問い合わせ`. Do not claim that Madoi operates features not present in code.

- [ ] **Step 4: Run the focused tests**

Run: `npm.cmd test -- tests/mobile-event-fab.test.tsx tests/login-consent-form.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/terms/page.tsx app/privacy/page.tsx app/layout.tsx app/globals.css components/mobile-event-fab.tsx tests/mobile-event-fab.test.tsx
git commit -m "feat: add fixed shell and mobile event action"
```

## Task 2: つながり・招待・チャットのDB境界

**Files:**
- Create: `supabase/migrations/017_connections_messages_and_invites.sql`
- Create: `tests/supabase/connections-schema.test.ts`
- Modify: `docs/design/02_database_design.md`

**Interfaces:**
- Produces tables: `user_connections`, `user_blocks`, `user_favorites`, `event_user_invitations`, `event_messages`.
- Produces SQL functions: `public.have_shared_event(uuid, uuid)`, `public.is_user_blocked(uuid, uuid)`, `public.is_event_member(uuid)`.

- [ ] **Step 1: Write failing schema assertions**

```ts
expect(sql).toContain("create table public.user_connections");
expect(sql).toContain("create table public.user_blocks");
expect(sql).toContain("create table public.user_favorites");
expect(sql).toContain("create table public.event_user_invitations");
expect(sql).toContain("create table public.event_messages");
expect(sql).toContain("check (char_length(trim(body)) > 0 and char_length(body) <= 2000)");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/supabase/connections-schema.test.ts`

Expected: FAIL because migration `017` does not exist.

- [ ] **Step 3: Write the migration**

```sql
create table public.user_connections (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
```

Add equivalent primary/foreign key/check constraints for blocks, favorites, and invitations. Use security-definer helpers to avoid the existing `events` / `event_members` RLS recursion. RLS must permit only: own relation management, owner invitation management, invitee response, and event-member message read/insert. Add indexes for every `*_user_id`, `event_id`, and `created_at` query path.

Also replace `notifications_kind_check` with a constraint that retains every existing kind and adds `event_invitation` and `event_message`.

- [ ] **Step 4: Update DB documentation and run the test**

Run: `npm.cmd test -- tests/supabase/connections-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/017_connections_messages_and_invites.sql tests/supabase/connections-schema.test.ts docs/design/02_database_design.md
git commit -m "feat: add connections invitations and messages schema"
```

## Task 3: つながりの判定とServer Actions

**Files:**
- Create: `lib/domain/connections.ts`
- Create: `lib/actions/connections.ts`
- Create: `tests/domain/connections.test.ts`

**Interfaces:**

```ts
export type ConnectionCandidate = {
  userId: string;
  displayName: string;
  sharedEventCount: number;
  latestSharedAt: string;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isFavorite: boolean;
};

export function sortInviteCandidates(candidates: ConnectionCandidate[]): ConnectionCandidate[];
export function isMutualFollow(candidate: ConnectionCandidate): boolean;
export async function followUserAction(userId: string): Promise<void>;
export async function unfollowUserAction(userId: string): Promise<void>;
export async function toggleFavoriteAction(userId: string): Promise<void>;
export async function blockUserAction(userId: string): Promise<void>;
```

- [ ] **Step 1: Write failing domain tests**

```ts
expect(sortInviteCandidates(candidates).map((candidate) => candidate.userId)).toEqual([
  "favorite", "mutual", "following", "recent"
]);
expect(isMutualFollow({ isFollowing: true, isFollowedBy: true } as ConnectionCandidate)).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/domain/connections.test.ts`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement the pure sorting and actions**

```ts
export function sortInviteCandidates(candidates: ConnectionCandidate[]) {
  return [...candidates].sort((a, b) =>
    Number(b.isFavorite) - Number(a.isFavorite) ||
    Number(isMutualFollow(b)) - Number(isMutualFollow(a)) ||
    Number(b.isFollowing) - Number(a.isFollowing) ||
    b.latestSharedAt.localeCompare(a.latestSharedAt)
  );
}
```

Every action must call `getCurrentUser`, reject self-targeting, call an admin-side shared-event/block check, change only the current user’s rows, and `revalidatePath("/connections")` plus the relevant event path. `blockUserAction` must delete both directions of `user_connections` and every favorite relation involving the blocked pair before inserting the block.

- [ ] **Step 4: Run the domain tests**

Run: `npm.cmd test -- tests/domain/connections.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/domain/connections.ts lib/actions/connections.ts tests/domain/connections.test.ts
git commit -m "feat: add connection actions and invite ordering"
```

## Task 4: つながり画面とMadoi内招待

**Files:**
- Create: `app/connections/page.tsx`
- Create: `components/connection-list.tsx`
- Create: `components/event-invite-candidates.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `lib/actions/connections.ts`
- Test: `tests/connection-list.test.tsx`
- Test: `tests/event-invite-candidates.test.tsx`

**Interfaces:**

```ts
export async function createEventUserInvitationsAction(eventId: string, inviteeUserIds: string[]): Promise<void>;
export async function respondToEventUserInvitationAction(invitationId: string, response: "accepted" | "declined"): Promise<void>;
```

- [ ] **Step 1: Write failing component tests**

```tsx
render(<ConnectionList favorites={[favorite]} following={[following]} candidates={[candidate]} />);
expect(screen.getByRole("heading", { name: "お気に入り" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "ブロック" })).toBeEnabled();

render(<EventInviteCandidates candidates={[favorite, recent]} action={vi.fn()} />);
expect(screen.getAllByRole("checkbox")[0]).toHaveAccessibleName("Aさんを招待する");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm.cmd test -- tests/connection-list.test.tsx tests/event-invite-candidates.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement UI and invitation actions**

`/connections` loads only current-user-owned relation data and groups it into `お気に入り`, `相互フォロー`, `フォロー中`, `最近一緒だった人`. Add a `つながり` link to settings.

`EventInviteCandidates` shows a multi-select list in the organizer-only section of event detail. It sorts with `sortInviteCandidates`, sends only selected ids, and renders an inline success message after revalidation. `createEventUserInvitationsAction` verifies owner status, shared-event history, no block, and no pending/accepted invite before inserting each invitation. Use `createSupabaseAdminClient` to create one `notifications` row per invitee with `kind = "event_invitation"`, `href = "/events/{eventId}"`, and dedupe key `event-invitation:{eventId}:{inviteeUserId}`.

`respondToEventUserInvitationAction` verifies invitee identity. On acceptance, insert or upsert an `event_members` row with `role = "member"`, `status = "joined"`; on decline, only update invitation status. Preserve the existing external shared-link invitation flow.

- [ ] **Step 4: Run the focused tests**

Run: `npm.cmd test -- tests/connection-list.test.tsx tests/event-invite-candidates.test.tsx tests/domain/connections.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/connections/page.tsx components/connection-list.tsx components/event-invite-candidates.tsx app/settings/page.tsx app/events/[eventId]/page.tsx lib/actions/connections.ts tests/connection-list.test.tsx tests/event-invite-candidates.test.tsx
git commit -m "feat: add connections and in-app invitations"
```

## Task 5: イベントチャットと新着通知

**Files:**
- Create: `lib/domain/event-chat.ts`
- Create: `lib/actions/event-messages.ts`
- Create: `components/event-chat.tsx`
- Modify: `app/events/[eventId]/page.tsx`
- Modify: `lib/domain/site-notifications.ts`
- Test: `tests/domain/event-chat.test.ts`
- Test: `tests/event-chat.test.tsx`

**Interfaces:**

```ts
export type EventMessage = { id: string; authorName: string; body: string; createdAt: string; isOwn: boolean };
export function normalizeEventMessageBody(value: string): string;
export async function createEventMessageAction(eventId: string, formData: FormData): Promise<void>;
```

- [ ] **Step 1: Write failing validation and UI tests**

```ts
expect(normalizeEventMessageBody("  集合は18時です  ")).toBe("集合は18時です");
expect(() => normalizeEventMessageBody("   ")).toThrow("メッセージを入力してください");
expect(() => normalizeEventMessageBody("a".repeat(2001))).toThrow("2,000文字以内");
```

```tsx
render(<EventChat messages={[message]} action={vi.fn()} canPost />);
expect(screen.getByText("集合は18時です")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "送信" })).toBeEnabled();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm.cmd test -- tests/domain/event-chat.test.ts tests/event-chat.test.tsx`

Expected: FAIL because the chat modules do not exist.

- [ ] **Step 3: Implement message posting and notification fan-out**

`createEventMessageAction` verifies the caller is a joined event member, rejects cancelled events, normalizes `body`, inserts one `event_messages` row, and uses `createSupabaseAdminClient` to upsert one unread notification for every other joined member. Use `kind = "event_message"`, `href = "/events/{eventId}#chat"`, and dedupe key `event-message:{eventId}:{recipientId}`. Each new message updates the notification title/body and sets `read_at` to `null`, so a busy event does not create one notification per post. Do not expose message text to users outside the event.

Render the latest 50 messages oldest-to-newest. Use a normal form with a text area and `aria-live="polite"` for submit errors. Do not add polling, websocket subscriptions, deletion, or attachments.

- [ ] **Step 4: Run the focused tests**

Run: `npm.cmd test -- tests/domain/event-chat.test.ts tests/event-chat.test.tsx tests/domain/site-notifications.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/domain/event-chat.ts lib/actions/event-messages.ts components/event-chat.tsx app/events/[eventId]/page.tsx lib/domain/site-notifications.ts tests/domain/event-chat.test.ts tests/event-chat.test.tsx
git commit -m "feat: add event member chat"
```

## Task 6: 期間限定のCalendar集計と再調整

**Files:**
- Modify: `app/api/events/[eventId]/availability/route.ts`
- Modify: `app/events/[eventId]/plans/new/page.tsx`
- Modify: `lib/actions/plans.ts`
- Modify: `lib/actions/confirm.ts`
- Modify: `app/plans/[planId]/page.tsx`
- Modify: `components/group-availability-calendar.tsx`
- Test: `tests/domain/calendar-availability-access.test.ts`
- Test: `tests/group-availability-calendar.test.tsx`

**Interfaces:**

```ts
export function canReadGroupAvailability(input: { eventStatus: string; isOwner: boolean }): boolean;
export async function restartPlanAdjustmentAction(planId: string): Promise<void>;
```

- [ ] **Step 1: Write failing access tests**

```ts
expect(canReadGroupAvailability({ eventStatus: "planning", isOwner: true })).toBe(true);
expect(canReadGroupAvailability({ eventStatus: "confirmed", isOwner: true })).toBe(false);
expect(canReadGroupAvailability({ eventStatus: "planning", isOwner: false })).toBe(false);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/domain/calendar-availability-access.test.ts`

Expected: FAIL because the access module does not exist.

- [ ] **Step 3: Implement access restriction and restart action**

Make the availability route load the event and require `owner_user_id === auth.uid()` plus event status `interested` or `planning`. Return `403` with the Madoi message `日程調整中の主催者だけが空き状況を集計できます。` for all other states. The route still returns only aggregate slots and never writes FreeBusy results.

`restartPlanAdjustmentAction` must require the plan owner, change `plans.status` to `collecting_answers`, clear `confirmed_start_at`, `confirmed_end_at`, and `is_all_day`, change `events.status` to `planning`, reset plan participant statuses to `invited`, and delete existing `availability_answers`. It creates notifications for the plan participants with a link to the existing answer page. Add a clear inline confirmation on the plan page before running it. The owner can then edit candidates and explicitly retrieve current aggregate availability again.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- tests/domain/calendar-availability-access.test.ts tests/group-availability-calendar.test.tsx tests/domain/confirmation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/api/events/[eventId]/availability/route.ts app/events/[eventId]/plans/new/page.tsx lib/actions/plans.ts lib/actions/confirm.ts app/plans/[planId]/page.tsx components/group-availability-calendar.tsx tests/domain/calendar-availability-access.test.ts tests/group-availability-calendar.test.tsx
git commit -m "feat: limit calendar availability to active adjustment"
```

## Task 7: 資料更新と最終確認

**Files:**
- Modify: `docs/current-status.md`
- Modify: `docs/design/01_requirements.md`
- Modify: `docs/design/02_database_design.md`
- Modify: `docs/design/03_screen_flow.md`
- Test: all existing tests

- [ ] **Step 1: Update product documents**

Document the login-only invitation path, favorites, block behavior, event chat scope, active-adjustment-only Calendar aggregation, restart-adjustment flow, and migration `017`.

- [ ] **Step 2: Run full test suite**

Run: `npm.cmd test`

Expected: PASS with no failing test files.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`

Expected: exit code `0`.

- [ ] **Step 4: Write user migration guide**

State the exact file to run in Supabase SQL Editor: `supabase/migrations/017_connections_messages_and_invites.sql`. Explain that no Google Cloud Console changes are required for this batch, but users may need to reconnect Calendar only if prior scope changes were not applied.

- [ ] **Step 5: Commit**

```powershell
git add docs/current-status.md docs/design/01_requirements.md docs/design/02_database_design.md docs/design/03_screen_flow.md
git commit -m "docs: record connections chat and calendar privacy"
```
