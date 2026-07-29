-- 共有リンク（日程回答・公開清算）を主催者が無効化し、新しいリンクを再発行できるようにする。
-- イベント招待リンク（event_invite_links）の status/revoked と同じ考え方に揃える。
-- 招待リンクと違い「自然に閉じる」状態はないので closed は設けず、open / revoked の2値にする。

alter table public.share_links
  add column if not exists status text not null default 'open',
  add column if not exists revoked_at timestamptz;

alter table public.share_links
  drop constraint if exists share_links_status_check;

alter table public.share_links
  add constraint share_links_status_check check (status in ('open', 'revoked'));

-- 有効なリンクは plan と purpose の組み合わせにつき常に1本だけにする。
-- 再発行は「既存を revoked にしてから insert」の順で行う前提。
drop index if exists share_links_one_open_per_plan_purpose_idx;

create unique index share_links_one_open_per_plan_purpose_idx
  on public.share_links(plan_id, purpose)
  where status = 'open';

create index if not exists share_links_status_idx on public.share_links(status);
