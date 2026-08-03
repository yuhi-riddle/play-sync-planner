-- 当日の進行表。日程が確定してはじめて書けるものなので、events ではなく plans に紐づける。
-- 担当は participants を指す。user_id が nullable なのでアプリ未登録の人にも担当を付けられ、
-- 退会(023)でも行が残るため表示が壊れない。

create table if not exists public.plan_timetable_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 100),
  note text check (note is null or char_length(note) <= 500),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_timetable_items_range_check check (end_at is null or end_at >= start_at)
);

create index if not exists plan_timetable_items_plan_id_start_at_idx
  on public.plan_timetable_items(plan_id, start_at);

create table if not exists public.plan_timetable_item_assignees (
  item_id uuid not null references public.plan_timetable_items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, participant_id)
);

create index if not exists plan_timetable_item_assignees_participant_id_idx
  on public.plan_timetable_item_assignees(participant_id);

drop trigger if exists plan_timetable_items_set_updated_at on public.plan_timetable_items;

create trigger plan_timetable_items_set_updated_at
before update on public.plan_timetable_items
for each row execute function public.set_updated_at();

alter table public.plan_timetable_items enable row level security;
alter table public.plan_timetable_item_assignees enable row level security;

-- is_event_member は event_id を取る。進行表は plan_id しか持たないのでサブクエリで引く。
-- テーブル名で修飾するのは、サブクエリ内の plans の列と行の plan_id を紛れさせないため。
drop policy if exists "Event members can view timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can add timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can update timetable items" on public.plan_timetable_items;
drop policy if exists "Event members can delete timetable items" on public.plan_timetable_items;

create policy "Event members can view timetable items"
on public.plan_timetable_items
for select
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

create policy "Event members can add timetable items"
on public.plan_timetable_items
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

-- 担当の付け替えや時刻の修正は、誰が作ったものでもメンバーなら操作できる（024 と同じ考え方）。
create policy "Event members can update timetable items"
on public.plan_timetable_items
for update
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
)
with check (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

create policy "Event members can delete timetable items"
on public.plan_timetable_items
for delete
to authenticated
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
);

drop policy if exists "Event members can view timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can add timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can update timetable assignees" on public.plan_timetable_item_assignees;
drop policy if exists "Event members can delete timetable assignees" on public.plan_timetable_item_assignees;

create policy "Event members can view timetable assignees"
on public.plan_timetable_item_assignees
for select
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can add timetable assignees"
on public.plan_timetable_item_assignees
for insert
to authenticated
with check (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can update timetable assignees"
on public.plan_timetable_item_assignees
for update
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
)
with check (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);

create policy "Event members can delete timetable assignees"
on public.plan_timetable_item_assignees
for delete
to authenticated
using (
  public.is_event_member(
    (select p.event_id
       from public.plan_timetable_items i
       join public.plans p on p.id = i.plan_id
      where i.id = plan_timetable_item_assignees.item_id)
  )
);
