-- イベントの自動完了。
--
-- 開催日を過ぎて清算不要のイベントは events.status が planning/confirmed のまま
-- 放置される（done を立てる経路が現状ゼロ）。最終開催日+30日で確認プロンプトを出し、
-- さらに14日オーナーの操作が無ければ cron が status='done' にする。
-- 設計: docs/superpowers/specs/2026-09-06-event-auto-completion-design.md
--
-- タイマー（promptDue / autoDoneDue）は列に保存しない。cron が毎回 plans と
-- 日付から導出する。保存するのは「後で」「戻す」が書く wrapup_snoozed_until と、
-- cron が自動 done したことを示す wrapup_auto_done だけ。

alter table public.events
  add column if not exists wrapup_snoozed_until timestamptz,
  add column if not exists wrapup_auto_done boolean not null default false;

-- cron はこの2状態のイベントだけ走査する。
create index if not exists events_wrapup_scan_idx
  on public.events (status)
  where status in ('planning', 'confirmed');

-- 通知種別に wrapup を追加（既存はすべて残す。migration 017 と同じパターン）。
alter table public.notifications
drop constraint if exists notifications_kind_check;

alter table public.notifications
add constraint notifications_kind_check check (
  kind in (
    'answer_deadline',
    'unanswered',
    'answer_received',
    'settlement_needed',
    'payment_due',
    'confirmation_due',
    'event_invitation',
    'event_message',
    'wrapup_prompt',
    'wrapup_done'
  )
);

-- バックフィル: このマイグレーション適用時点で最終開催日が90日超前の
-- planning/confirmed イベントは「もう気にしていない」扱い。恒久スヌーズして
-- wrapup の対象から外す（プロンプトも自動 done も出ない）。
--
-- 対象を絞る条件は TS の isEventWrapupEligible に寄せる:
--   - 清算待ちのプランがあるものは除外（清算完了後に wrapup 対象へ移るので隠さない）
--   - 日時が未確定の関連プランがあるものは除外（lifecycle 未確定なので TS は null 扱い）
-- 最終開催日は「取り消し以外の確定プランの最遅終了」または events の開催日。
update public.events e
set wrapup_snoozed_until = '2999-01-01T00:00:00Z'
where e.status in ('planning', 'confirmed')
  and e.wrapup_snoozed_until is null
  and not exists (
    select 1 from public.plans p
    where p.event_id = e.id
      and p.status not in ('cancelled', 'skipped')
      and (
        coalesce(p.settlement_status, 'not_started') not in ('not_needed', 'settled')
        or p.confirmed_start_at is null
      )
  )
  and coalesce(
    (
      select max(coalesce(p.confirmed_end_at, p.confirmed_start_at))
      from public.plans p
      where p.event_id = e.id
        and p.status not in ('cancelled', 'skipped')
        and p.confirmed_start_at is not null
    ),
    (coalesce(e.end_date, e.start_date) + 1)::timestamp at time zone 'Asia/Tokyo'
  ) < now() - interval '90 days';

-- ロールバック:
--   alter table public.events drop column if exists wrapup_snoozed_until;
--   alter table public.events drop column if exists wrapup_auto_done;
--   drop index if exists public.events_wrapup_scan_idx;
--   （notifications_kind_check は migration 017 の内容へ張り直す）
