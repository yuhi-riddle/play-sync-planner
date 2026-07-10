# 参加者先行・Calendar集計型の日程調整 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Googleログイン・Calendar連携済みの参加者を先に集め、個人の予定内容を公開せずに空き時間の集計を参考に候補作成と○△×投票を行えるようにする。

Architecture: イベント参加者は新設する event_members、参加リンクは event_invite_links で管理する。空き状況はDBへ保存せず、主催者が候補作成画面を操作するときに参加者ごとのGoogle Calendar free/busy情報をサーバー側で取得し、15分単位の集計に変換する。既存の participants は日程調整ごとの投票対象として残し、参加受付を閉じた時点のイベント参加者を複製する。

Tech Stack: Next.js 15 App Router、React 19、TypeScript、Supabase Auth/Postgres/RLS、Google Calendar API、Tailwind CSS、Vitest + Testing Library。

## Global Constraints

- GoogleログインとGoogle Calendar連携を、イベント参加・日程調整作成の必須条件にする。
- 集計API・画面・ログに、予定名、場所、説明、参加者別の可否を含めない。
- 空き時間は永続化しない。表示時の取得結果はクライアント状態だけで扱う。
- 空き状況は15分単位で集計する。○△×投票を自動決定で置き換えない。
- 参加リンクは固定期限を使わず、主催者の参加受付を閉じる操作と停止・再発行で管理する。
- スクリーンショット確認はユーザーから明示依頼があった場合だけ行う。
- 既存の未コミット変更・確認画像は、各タスクのコミットに含めない。

---

## ファイル構成

| ファイル | 役割 |
|---|---|
| supabase/migrations/014_member_first_coordination.sql | イベント参加者・招待リンク・RLSを追加する。 |
| lib/domain/event-members.ts | 参加受付・参加者スナップショットの純粋関数と型。 |
| lib/domain/group-availability.ts | free/busy範囲を15分単位の匿名集計へ変換する。 |
| lib/actions/event-members.ts | 参加リンク作成、参加受付の停止・再発行、参加処理を行う。 |
| lib/google-calendar/freebusy.ts | Google Calendar free/busy APIのリクエスト・レスポンス正規化。 |
| app/api/events/[eventId]/availability/route.ts | 主催者用の匿名空き状況集計API。 |
| app/invites/[token]/page.tsx | Googleログイン・Calendar連携後にイベントへ参加する招待ページ。 |
| components/event-member-invite-card.tsx | 招待リンクのコピー、受付状態、停止・再発行を扱うカード。 |
| components/group-availability-calendar.tsx | 15分単位の濃淡、最終更新、手動更新を扱うクライアントUI。 |

### Task 1: イベント参加者と招待リンクのDB基盤

Files:
- Create: supabase/migrations/014_member_first_coordination.sql
- Create: lib/domain/event-members.ts
- Create: tests/domain/event-members.test.ts

Interfaces:
- Produces: EventMember, EventInviteStatus, canJoinWithInvite(), canStartPlanFromMembers(), snapshotEventMembersForPlan().
- Consumes: events.id、auth.users.id、既存の participants テーブル。

- [ ] Step 1: 参加受付と参加者スナップショットの失敗テストを書く

    expect(canJoinWithInvite({ status: "open" })).toBe(true);
    expect(canJoinWithInvite({ status: "closed" })).toBe(false);
    expect(snapshotEventMembersForPlan(members, "plan-1")).toEqual([
      expect.objectContaining({ plan_id: "plan-1", user_id: "owner", is_organizer: true })
    ]);

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/domain/event-members.test.ts

Expected: event-members モジュールのimport解決でFAIL。

- [ ] Step 3: マイグレーションを追加する

    create table public.event_members (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references public.events(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      display_name text not null,
      role text not null default 'member' check (role in ('organizer', 'member')),
      status text not null default 'joined' check (status in ('joined', 'removed')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (event_id, user_id)
    );

    create table public.event_invite_links (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references public.events(id) on delete cascade,
      token text not null unique,
      status text not null default 'open' check (status in ('open', 'closed', 'revoked')),
      created_by_user_id uuid not null references auth.users(id) on delete cascade,
      closed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

同じマイグレーションで、主催者は新規テーブルを管理でき、参加者は自分が参加するイベントを参照できるRLSへ更新する。既存の events の所有者だけのポリシーは、所有者または event_members.user_id = auth.uid() が参照できるポリシーに置き換える。

- [ ] Step 4: ドメイン関数を実装してテストを通す

    export function snapshotEventMembersForPlan(members: EventMember[], planId: string) {
      return members.filter((member) => member.status === "joined").map((member) => ({
        plan_id: planId,
        user_id: member.user_id,
        display_name: member.display_name,
        participant_type: "registered" as const,
        status: "invited" as const,
        is_organizer: member.role === "organizer"
      }));
    }

Run: npm.cmd test -- tests/domain/event-members.test.ts

Expected: PASS。

- [ ] Step 5: Supabase SQL Editorでマイグレーションを適用し、コミットする

Supabase SQL Editorへ 014_member_first_coordination.sql を実行して、Table Editorで2テーブルを確認する。

    git add supabase/migrations/014_member_first_coordination.sql lib/domain/event-members.ts tests/domain/event-members.test.ts
    git commit -m "feat: add event member foundation"

### Task 2: イベント作成・参加受付・招待参加

Files:
- Modify: lib/actions/events.ts
- Create: lib/actions/event-members.ts
- Modify: lib/domain/event-flow.ts
- Modify: app/events/[eventId]/page.tsx
- Create: app/invites/[token]/page.tsx
- Create: components/event-member-invite-card.tsx
- Create: tests/event-member-invite-card.test.tsx
- Create: tests/invite-flow.test.tsx

Interfaces:
- Produces: createEventInviteAction(eventId), closeEventInvitesAction(eventId), revokeAndCreateEventInviteAction(eventId), joinEventFromInviteAction(token).
- Consumes: event_members、event_invite_links、Calendar連携状態。

- [ ] Step 1: 導線とカードの失敗テストを書く

    expect(getAfterEventCreatePath("event-1")).toBe("/events/event-1");
    render(<EventMemberInviteCard memberCount={3} inviteUrl="https://madoi.example/invites/a" status="open" />);
    expect(screen.getByText("参加済み 3人")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "参加受付を閉じて日程調整へ進む" })).toBeEnabled();

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/domain/event-flow.test.ts tests/event-member-invite-card.test.tsx tests/invite-flow.test.tsx

Expected: 新規コンポーネント・パスの不一致でFAIL。

- [ ] Step 3: 主催者登録と招待リンク発行を実装する

    await supabase.from("event_members").insert({ event_id: event.id, user_id: userId, display_name, role: "organizer" });
    await supabase.from("event_invite_links").insert({ event_id: event.id, token: randomUUID(), created_by_user_id: userId });
    redirect("/events/" + event.id);

受付中の詳細画面には参加人数、リンクコピー、停止、再発行、受付を閉じる操作だけを表示する。Calendar連携人数や個人名は通常表示しない。

- [ ] Step 4: 招待ページと必須連携を実装する

未ログインなら /login?next=/invites/[token]、未連携なら /api/google-calendar/connect?next=/invites/[token] へ案内する。ログイン・連携済みなら joinEventFromInviteAction(token) で重複なしに参加する。閉じた・停止済み・無効なリンクには日本語の状態画面を出す。

- [ ] Step 5: テストを通してコミットする

Run: npm.cmd test -- tests/domain/event-flow.test.ts tests/event-member-invite-card.test.tsx tests/invite-flow.test.tsx

Expected: PASS。

    git add lib/actions/events.ts lib/actions/event-members.ts lib/domain/event-flow.ts app/events/[eventId]/page.tsx app/invites/[token]/page.tsx components/event-member-invite-card.tsx tests
    git commit -m "feat: add member collection flow"

### Task 3: OAuth復帰先と設定画面を必須連携仕様にする

Files:
- Modify: app/login/page.tsx
- Modify: app/auth/callback/route.ts
- Modify: app/api/google-calendar/connect/route.ts
- Modify: app/api/google-calendar/callback/route.ts
- Modify: components/calendar-connection-card.tsx
- Modify: tests/google-calendar/oauth.test.ts
- Modify: tests/calendar-connection-card.test.tsx

Interfaces:
- Produces: safeNextPath(value: string | null): string。
- Consumes: Cookie madoi_login_next と madoi_calendar_next。

- [ ] Step 1: 安全な復帰先の失敗テストを書く

    expect(safeNextPath("/invites/token-1")).toBe("/invites/token-1");
    expect(safeNextPath("https://example.com")).toBe("/");
    expect(safeNextPath("//example.com")).toBe("/");

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/google-calendar/oauth.test.ts

Expected: safeNextPath 未定義でFAIL。

- [ ] Step 3: 復帰先Cookieと画面文言を実装する

ログイン・Calendar OAuth開始時に / から始まり // で始まらない相対パスだけをCookieに保存する。各callbackはCookieを削除してそのパスへ戻る。設定カードの説明は「日程調整への参加・作成には連携が必要です。予定の内容は共有されません。」に更新する。

- [ ] Step 4: テストを通してコミットする

Run: npm.cmd test -- tests/google-calendar/oauth.test.ts tests/calendar-connection-card.test.tsx

Expected: PASS。

    git add app/login/page.tsx app/auth/callback/route.ts app/api/google-calendar/connect/route.ts app/api/google-calendar/callback/route.ts components/calendar-connection-card.tsx tests
    git commit -m "feat: preserve invite flow through calendar auth"

### Task 4: 匿名のGoogle free/busy集計API

Files:
- Create: lib/google-calendar/freebusy.ts
- Create: lib/domain/group-availability.ts
- Create: app/api/events/[eventId]/availability/route.ts
- Modify: lib/actions/calendar.ts
- Create: tests/google-calendar/freebusy.test.ts
- Create: tests/domain/group-availability.test.ts

Interfaces:
- Produces: fetchCalendarFreeBusy(), buildAvailabilitySlots(), GroupAvailabilityResponse。
- GroupAvailabilityResponse は month、updatedAt、participantCount、slots のみを返す。slotsの各要素は start、end、availableCount とする。

- [ ] Step 1: free/busy正規化と15分集計の失敗テストを書く

    expect(normalizeFreeBusyResponse({ calendars: { primary: { busy: [{ start: "2026-07-15T01:00:00Z", end: "2026-07-15T02:00:00Z" }] } } })).toEqual([
      { start: "2026-07-15T01:00:00Z", end: "2026-07-15T02:00:00Z" }
    ]);
    expect(buildAvailabilitySlots({ participantCount: 2, busyByParticipant, range })).toContainEqual({
      start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 1
    });

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/google-calendar/freebusy.test.ts tests/domain/group-availability.test.ts

Expected: 新規モジュールのimport解決でFAIL。

- [ ] Step 3: free/busyクライアントと15分集計を実装する

    await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin, timeMax, timeZone: "Asia/Tokyo", items: [{ id: calendarId }] })
    });

対象月を Asia/Tokyo 基準で15分単位へ分け、参加者ごとのbusy範囲と重なる人数から availableCount を計算する。個人単位の結果はレスポンス作成前に破棄する。

- [ ] Step 4: 集計APIを実装する

主催者だけが GET /api/events/[eventId]/availability?month=YYYY-MM を実行できるようにする。参加済み全員のトークンを管理クライアントで読み、既存のトークン更新を共通化してからfree/busyを取得する。認可失効者がいれば、個人を特定しない人数だけをエラー情報として返す。

- [ ] Step 5: テストを通してコミットする

Run: npm.cmd test -- tests/google-calendar/freebusy.test.ts tests/domain/group-availability.test.ts tests/google-calendar/oauth.test.ts

Expected: PASS。

    git add lib/google-calendar/freebusy.ts lib/domain/group-availability.ts app/api/events/[eventId]/availability/route.ts lib/actions/calendar.ts tests
    git commit -m "feat: add anonymous group availability API"

### Task 5: 空き時間の濃淡カレンダーを候補作成へ追加

Files:
- Create: components/group-availability-calendar.tsx
- Modify: components/plan-form.tsx
- Modify: app/events/[eventId]/plans/new/page.tsx
- Create: tests/group-availability-calendar.test.tsx
- Modify: tests/plan-form.test.tsx

Interfaces:
- Consumes: GET /api/events/:eventId/availability?month=YYYY-MM。
- Produces: GroupAvailabilityCalendar。Propsは eventId、visibleMonth、selectedRange、onChangeMonth、onSelectRange。

- [ ] Step 1: 濃淡・更新・秘匿の失敗テストを書く

    render(<GroupAvailabilityCalendar eventId="event-1" visibleMonth="2026-07" selectedRange={null} onSelectRange={vi.fn()} />);
    await screen.findByText("最終更新:");
    expect(screen.getByLabelText("空き状況を更新")).toBeEnabled();
    expect(screen.queryByText("会議")).not.toBeInTheDocument();

加えて、タブ復帰から5分未満なら再取得せず、5分以上なら再取得するテストを書く。

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/group-availability-calendar.test.tsx

Expected: GroupAvailabilityCalendar のimport解決でFAIL。

- [ ] Step 3: 月カレンダーと更新ルールを実装する

availableCount / participantCount の割合を4段階の背景色へ変換し、色だけに依存しない aria-label を付ける。初回、月変更、候補範囲変更、手動更新、前回成功から5分以上後のタブ復帰で取得する。失敗しても候補入力は止めない。

- [ ] Step 4: PlanFormへ組み込む

候補日時ステップの先頭へ集計カレンダーを置く。既存の本人予定パネルは本人の衝突確認用に残す。候補の時間範囲を選ぶと 空き N人 を表示する。

- [ ] Step 5: テストを通してコミットする

Run: npm.cmd test -- tests/group-availability-calendar.test.tsx tests/plan-form.test.tsx

Expected: PASS。

    git add components/group-availability-calendar.tsx components/plan-form.tsx app/events/[eventId]/plans/new/page.tsx tests
    git commit -m "feat: show group availability in plan form"

### Task 6: 参加者スナップショットで日程調整を作成する

Files:
- Modify: lib/actions/plans.ts
- Modify: lib/validators.ts
- Create: tests/actions/plan-member-snapshot.test.ts
- Modify: tests/validators.test.ts

Interfaces:
- Consumes: snapshotEventMembersForPlan()、受付終了済みの event_invite_links。
- Produces: createPlanAction() がイベント参加者全員を投票対象として作成する。

- [ ] Step 1: スナップショット作成の失敗テストを書く

    expect(buildPlanParticipantsFromMembers(members, "plan-1")).toEqual([
      expect.objectContaining({ user_id: "owner", is_organizer: true, participant_type: "registered" }),
      expect.objectContaining({ user_id: "member-1", is_organizer: false, participant_type: "registered" })
    ]);

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/actions/plan-member-snapshot.test.ts

Expected: 対象関数未定義でFAIL。

- [ ] Step 3: 作成・編集処理を変更する

createPlanAction() はイベント所有者かつ参加受付終了済みの場合だけ実行し、event_members.status = joined の全員を participants に登録する。フォームの participantNames は削除する。編集時は既存参加者を削除・再作成せず、候補日時・回答期限・リマインドだけを更新する。

- [ ] Step 4: テストを通してコミットする

Run: npm.cmd test -- tests/actions/plan-member-snapshot.test.ts tests/validators.test.ts tests/plan-form.test.tsx

Expected: PASS。

    git add lib/actions/plans.ts lib/validators.ts tests/actions/plan-member-snapshot.test.ts tests/validators.test.ts tests/plan-form.test.tsx
    git commit -m "feat: snapshot event members into plans"

### Task 7: 認証必須の回答・清算導線へ移行

Files:
- Modify: app/s/[token]/answer/page.tsx
- Modify: app/s/[token]/answer/complete/page.tsx
- Modify: lib/actions/answers.ts
- Modify: components/answer-form.tsx
- Modify: app/s/[token]/settlement/page.tsx
- Modify: tests/answer-form.test.tsx
- Modify: tests/domain/participant-identity.test.ts

Interfaces:
- Produces: canSubmitPlanAnswer({ currentUserId, memberUserIds }): boolean。
- Consumes: ログインユーザー、event_members、日程調整の participants。

- [ ] Step 1: 未ログイン・非参加者拒否の失敗テストを書く

    expect(canSubmitPlanAnswer({ currentUserId: null, memberUserIds: ["user-1"] })).toBe(false);
    expect(canSubmitPlanAnswer({ currentUserId: "user-2", memberUserIds: ["user-1"] })).toBe(false);
    expect(canSubmitPlanAnswer({ currentUserId: "user-1", memberUserIds: ["user-1"] })).toBe(true);

- [ ] Step 2: テストが失敗することを確認する

Run: npm.cmd test -- tests/domain/participant-identity.test.ts

Expected: canSubmitPlanAnswer 未定義でFAIL。

- [ ] Step 3: 回答を登録済み参加者へ限定する

未ログインはログイン画面へ戻す。回答処理は現在のユーザーIDの participants 行だけを更新し、名前入力とゲスト参加者の作成を削除する。共有トークンは対象の日程調整を探すためだけに残し、非参加者には内容を表示しない。

- [ ] Step 4: 清算ページも同じ認可へ揃える

トークンを知っていてもイベント参加者でなければ清算情報を表示しない。未ログイン向けの文言をGoogleログインが必要な案内へ置き換える。

- [ ] Step 5: テストを通してコミットする

Run: npm.cmd test -- tests/answer-form.test.tsx tests/domain/participant-identity.test.ts tests/public-settlement-summary.test.tsx

Expected: PASS。

    git add app/s/[token]/answer app/s/[token]/settlement lib/actions/answers.ts components/answer-form.tsx tests
    git commit -m "feat: require membership for answers and settlements"

### Task 8: 資料更新と回帰確認

Files:
- Modify: README.md
- Modify: docs/current-status.md
- Modify: docs/design/01_requirements.md
- Modify: docs/design/02_database_design.md
- Modify: docs/design/03_screen_flow.md
- Modify: docs/phase2-google-calendar-setup.md

- [ ] Step 1: 資料を現仕様へ更新する

Googleログイン必須、Calendar連携必須、イベント参加者先行、匿名集計、参加受付を閉じる運用、未ログイン回答廃止を反映する。Google Cloud Consoleの既存 calendar.events 権限は、予定作成とfree/busy取得の両方に使うことを明記する。

- [ ] Step 2: 全テストを実行する

Run: npm.cmd test

Expected: 全テストがPASS。新規のReact act(...) 警告がない。

- [ ] Step 3: 本番ビルドを実行する

Run: npm.cmd run build

Expected: Next.jsの型検査・静的生成・ビルドが成功。

- [ ] Step 4: ユーザーが明示した場合だけ手動確認する

1. Googleログイン後、イベント作成者が参加者として登録される。
2. 参加リンクからログイン・Calendar連携・参加まで戻れる。
3. 参加受付を閉じると新規参加できない。
4. 候補作成カレンダーに予定内容や個人名が出ない。
5. 月変更・手動更新・5分後のタブ復帰で集計を更新できる。
6. 参加者全員が○△×投票し、主催者が日程確定とCalendar招待へ進める。

- [ ] Step 5: コミットする

    git add README.md docs/current-status.md docs/design/01_requirements.md docs/design/02_database_design.md docs/design/03_screen_flow.md docs/phase2-google-calendar-setup.md
    git commit -m "docs: update member-first coordination flow"

## Plan Self-Review

- Googleログイン必須、Calendar連携必須、匿名集計、15分単位、参加受付の停止、投票維持、投票後の差分監視なしをTask 1からTask 7へ割り当てた。
- event_members と日程調整ごとの participants を分離し、スナップショット作成責務をTask 6へ固定した。
- 集計APIが個人情報を返さない型をTask 4で明示し、UIでも予定内容をDOMへ渡さないことをTask 5に含めた。
- 固定期限、Push通知、自動確定、友達機能は計画に含めていない。

