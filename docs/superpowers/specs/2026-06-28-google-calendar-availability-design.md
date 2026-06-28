# Google Calendar Availability Design

## Goal

Phase 2-Aでは、日程調整作成・編集画面で自分のGoogle Calendar予定を見ながら候補日時を作れるようにする。

最初の到達点は「自分の予定と候補日時の被りが分かる」ことです。確定した日程のGoogle Calendar登録、終日候補、リマインド送信は次の小タスクに分けます。

## References

- Google Calendar API FreeBusy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Calendar API Events insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google Calendar API Authorization: https://developers.google.com/workspace/calendar/api/auth

## Scope

### Build

- 設定画面にGoogle Calendar連携状態を表示する。
- Google Calendar接続と解除をできるようにする。
- `calendar_integrations` テーブルを追加する。
- Google OAuthのアクセストークンとリフレッシュトークンを安全に保存する。
- 日程調整作成・編集画面で、表示中の月にある自分の予定を取得する。
- カレンダー上で予定がある日を分かるようにする。
- 選択中の日付の予定を、候補日時入力の近くに表示する。
- 追加しようとしている候補日時が既存予定と重なる場合、警告を出す。
- プライバシーポリシーとセットアップ手順に、Google Calendarで扱う情報と追加設定を追記する。

### Do Not Build

- 確定日時をGoogle Calendarへ登録する。
- 参加者全員のGoogle Calendarを集めて自動調整する。
- 終日候補の入力とGoogle Calendar登録。
- リマインド送信。
- Google Calendarの予定名や詳細本文の保存。
- 複数カレンダー選択。

## Product Behavior

### Settings

`/settings` に「Google Calendar連携」カードを追加する。

未連携:

- 「未連携」と表示する。
- 「Google Calendarを連携」ボタンを表示する。
- 取得する情報は「空き時間の確認に必要な予定時間帯」です、と短く説明する。

連携済み:

- 「連携済み」と表示する。
- 連携したGoogleアカウントのメールアドレスを表示する。
- 「連携を解除」ボタンを表示する。
- 最終更新日時を表示する。

エラー時:

- Googleの認可が失敗した場合は `/settings?calendar=error` に戻す。
- 設定画面に「Google Calendarと接続できませんでした。もう一度試してください。」と表示する。

### Plan Form

`/events/:eventId/plans/new` と `/plans/:planId/edit` の `PlanForm` に、Google Calendar予定表示を追加する。

未連携:

- 候補日時ステップに「Google Calendarを連携すると、自分の予定と重なる候補が分かります。」と表示する。
- 設定画面へのリンクを表示する。
- 候補日時作成は今までどおり使える。

連携済み:

- 表示中の月についてFreeBusyを取得する。
- カレンダーの日付セルに、その日に予定があることを示す小さな印を出す。
- 選択中の日付の下に、その日の予定時間帯を時系列で表示する。
- 候補開始〜終了が既存予定と重なる場合、「Google Calendarの予定と重なっています。」と警告する。
- 警告があっても候補追加は禁止しない。ユーザーが意図的に入れられるようにする。

Google Calendar APIからはFreeBusyの `busy` 時間帯だけを使う。予定名、場所、説明は取得しない。

## OAuth Design

既存のGoogleログインはSupabase Authのまま使う。Calendar連携は別のOAuthフローとして実装する。

理由:

- ログインとCalendar API権限を分けると、あとから権限の説明がしやすい。
- Calendarを使いたくないユーザーも、ログインだけでPhase 1機能を使える。
- FreeBusyだけの最小権限から始められる。

追加する環境変数:

```text
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=
```

`CALENDAR_TOKEN_ENCRYPTION_KEY` は32バイト相当のランダム値をbase64で保存する。トークンはアプリ側で暗号化してDBへ保存する。

OAuthルート:

- `GET /api/google-calendar/connect`
  - ログイン済みユーザーだけ使える。
  - stateを発行してHttpOnly cookieに保存する。
  - Google OAuth画面へリダイレクトする。

- `GET /api/google-calendar/callback`
  - state cookieとクエリのstateを照合する。
  - codeをGoogle token endpointで交換する。
  - refresh tokenを暗号化して `calendar_integrations` に保存する。
  - `/settings?calendar=connected` に戻す。

- `POST /api/google-calendar/disconnect`
  - ログイン済みユーザーの `calendar_integrations` を削除する。
  - `/settings?calendar=disconnected` に戻す。

Phase 2-AのOAuthスコープは、FreeBusy取得用の最小権限として `https://www.googleapis.com/auth/calendar.freebusy` を使う。もしGoogle Cloud ConsoleやOAuth検証でこのスコープが使えない場合は、実装を止めてユーザーへ報告し、`calendar.readonly` などの広い権限へ広げる前に確認を取る。

確定日時をGoogle Calendarへ登録するPhase 2-Bでは、別途 `calendar.events` 系の権限追加を検討する。

## Data Model

新しいマイグレーション `supabase/migrations/002_calendar_integrations.sql` を追加する。

```sql
create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null default 'primary',
  account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_integrations_provider_check check (provider in ('google')),
  constraint calendar_integrations_user_provider_unique unique (user_id, provider)
);

create index calendar_integrations_user_id_idx on public.calendar_integrations(user_id);

create trigger calendar_integrations_set_updated_at
before update on public.calendar_integrations
for each row execute function public.set_updated_at();

alter table public.calendar_integrations enable row level security;

create policy "Users can manage their calendar integration"
on public.calendar_integrations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

Service roleを使う処理は、サーバー側のOAuth callbackとFreeBusy APIに閉じる。クライアントへトークンは返さない。

## Server Modules

追加する責務:

- `lib/google-calendar/oauth.ts`
  - Google OAuth URL生成
  - code交換
  - access token更新

- `lib/google-calendar/token-crypto.ts`
  - AES-GCMでトークン暗号化
  - AES-GCMでトークン復号

- `lib/google-calendar/freebusy.ts`
  - FreeBusy API呼び出し
  - Googleのレスポンスを `{ start: string; end: string }[]` に正規化

- `lib/domain/calendar-availability.ts`
  - busy時間帯と候補日時の重なり判定
  - 月表示用の日別busy件数作成

## Client UI

`PlanForm` は現在でも大きいので、Phase 2-AでCalendar表示部分を別コンポーネントに分ける。

追加するコンポーネント:

- `components/calendar-availability-panel.tsx`
  - 選択中の日付のbusy時間帯を表示する。
  - 候補日時との重なり警告を表示する。

- `components/calendar-connection-card.tsx`
  - 設定画面のGoogle Calendar連携カード。

`PlanForm` 側は次のpropsだけ受け取る。

```ts
type CalendarAvailabilityProps = {
  enabled: boolean;
  settingsHref: string;
};
```

FreeBusyの取得はクライアントから `GET /api/google-calendar/freebusy?month=YYYY-MM` を呼ぶ。

返すJSON:

```ts
type FreeBusyResponse =
  | {
      connected: true;
      busy: Array<{ start: string; end: string }>;
    }
  | {
      connected: false;
      busy: [];
    };
```

## Privacy and Setup

`app/privacy/page.tsx` に次を追記する。

- Google Calendar連携時は、空き時間確認に必要な予定時間帯を取得する。
- Phase 2-Aでは予定名、場所、説明は取得しない。
- 取得したアクセストークンとリフレッシュトークンは暗号化して保存する。
- 連携解除で保存済みトークンを削除する。

`docs/phase1-user-setup.md` とは別に、Phase 2用の `docs/phase2-google-calendar-setup.md` を作る。

ユーザー作業:

1. Google Cloud Consoleで既存プロジェクトを開く。
2. OAuth同意画面にCalendar用のスコープを追加する。
3. OAuth ClientのAuthorized redirect URIsに `http://localhost:3000/api/google-calendar/callback` を追加する。
4. `.env.local` にPhase 2用の環境変数を追加する。
5. Supabase SQL Editorで `002_calendar_integrations.sql` を実行する。

## Error Handling

- Calendar未連携の場合、候補日時作成は止めない。
- FreeBusy取得に失敗した場合、画面には「Google Calendarの予定を取得できませんでした」と表示し、候補追加は止めない。
- refresh tokenが失効している場合、連携状態を「再連携が必要」と表示する。
- Google APIのレスポンスをそのまま画面に出さない。

## Testing

追加するテスト:

- `tests/domain/calendar-availability.test.ts`
  - busy時間帯と候補日時が重なる場合に `true` を返す。
  - 端点が接しているだけなら重なり扱いにしない。
  - 日別busy件数を作れる。

- `tests/google-calendar/token-crypto.test.ts`
  - 暗号化した値を復号できる。
  - 同じ平文でも暗号文が毎回変わる。

- `tests/google-calendar/freebusy.test.ts`
  - Google FreeBusyレスポンスを内部形式に正規化できる。
  - 空レスポンスを空配列にできる。

- `tests/calendar-availability-panel.test.tsx`
  - 未連携時に設定画面への導線を表示する。
  - busy時間帯を表示する。
  - 候補日時と重なる場合に警告を表示する。

検証コマンド:

```powershell
npm.cmd test
npm.cmd run build
```

## Rollout

1. DBマイグレーションと環境変数を追加する。
2. 設定画面に連携カードを追加する。
3. Google OAuth接続と解除を追加する。
4. FreeBusy取得APIを追加する。
5. PlanFormに予定表示と重なり警告を追加する。
6. プライバシーポリシーとセットアップ手順を更新する。

この順番なら、Calendar接続だけ、FreeBusy取得だけ、PlanForm表示だけをそれぞれ小さく確認できる。
