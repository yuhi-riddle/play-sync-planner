-- 確定予定の Google カレンダー作成を冪等にするための進行状態。
--
-- これまで lib/actions/calendar/calendar.ts は
--   google_calendar_event_id が無いことを確認 → Google に insert → DB に id を書く
-- という流れで、二重クリックや複数タブ、Google 成功後の DB 失敗で
-- 同じ予定・招待が複数作られていた。
--
-- idle → creating の条件付き update に成功した実行だけが Google を叩くようにする。
-- 併せて Google イベント側の id も planId から決めるので、万一二重に叩いても
-- Google が 409 を返して二重作成を防ぐ（アプリ側の対応は calendar.ts）。

alter table public.plans
  add column if not exists google_calendar_sync_state text not null default 'idle';

alter table public.plans
  drop constraint if exists plans_google_calendar_sync_state_check;

alter table public.plans
  add constraint plans_google_calendar_sync_state_check
  check (google_calendar_sync_state in ('idle', 'creating', 'created'));

-- 既に作成済みの予定は created に寄せる。
update public.plans
set google_calendar_sync_state = 'created'
where google_calendar_event_id is not null
  and google_calendar_sync_state <> 'created';
