-- イベント当日の持ち物・役割の分担リスト。
-- 日程調整(plans)ではなくイベントに紐づける。準備は日程が決まる前から始まるため。
-- 担当者は event_members に joined で入っている実ユーザーから選ぶ。
-- 退会(023)で auth.users は消さないが、将来の削除に備えて on delete set null にしておく。

create table if not exists public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 100),
  assignee_user_id uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_tasks_event_id_sort_order_idx
  on public.event_tasks(event_id, sort_order);

create index if not exists event_tasks_assignee_user_id_idx
  on public.event_tasks(assignee_user_id);

drop trigger if exists event_tasks_set_updated_at on public.event_tasks;

create trigger event_tasks_set_updated_at
before update on public.event_tasks
for each row execute function public.set_updated_at();

alter table public.event_tasks enable row level security;

-- is_event_member は 017 で定義済みの security definer 関数。
-- event_messages と同じ「参加済みメンバーだけ」の判定を使う。
drop policy if exists "Event members can view tasks" on public.event_tasks;
drop policy if exists "Event members can add tasks" on public.event_tasks;
drop policy if exists "Event members can update tasks" on public.event_tasks;
drop policy if exists "Event members can delete tasks" on public.event_tasks;

create policy "Event members can view tasks"
on public.event_tasks
for select
to authenticated
using (public.is_event_member(event_id));

create policy "Event members can add tasks"
on public.event_tasks
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.is_event_member(event_id)
);

-- 担当の付け替えや完了は、誰が作ったものでもメンバーなら操作できる。
create policy "Event members can update tasks"
on public.event_tasks
for update
to authenticated
using (public.is_event_member(event_id))
with check (public.is_event_member(event_id));

create policy "Event members can delete tasks"
on public.event_tasks
for delete
to authenticated
using (public.is_event_member(event_id));
