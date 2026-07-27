-- 退会（アカウント削除）の受け皿。
--
-- events.owner_user_id は on delete cascade なので、auth.users の行を消すと
-- 主催イベント → plans → expenses → settlements まで連鎖して消え、
-- 他の参加者の清算記録まで巻き添えになる。
-- そのため退会は「auth.users を消さず、個人情報だけ削除して表示名を匿名化する」方式にする。
-- ここではその印を付ける列だけを足す。

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles(deleted_at)
  where deleted_at is not null;

comment on column public.profiles.deleted_at is
  '退会日時。値が入っている行は退会済みで、nickname は匿名化されている。';
