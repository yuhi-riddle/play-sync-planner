create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member',
  status text not null default 'joined',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_members_role_check check (role in ('organizer', 'member')),
  constraint event_members_status_check check (status in ('joined', 'removed')),
  constraint event_members_event_user_unique unique (event_id, user_id)
);

create table public.event_invite_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  token text not null unique,
  status text not null default 'open',
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_invite_links_status_check check (status in ('open', 'closed', 'revoked'))
);

create unique index event_invite_links_one_open_per_event_idx
  on public.event_invite_links(event_id)
  where status = 'open';

create index event_members_event_id_idx on public.event_members(event_id);
create index event_members_user_id_idx on public.event_members(user_id);
create index event_invite_links_event_id_idx on public.event_invite_links(event_id);

create trigger event_members_set_updated_at
before update on public.event_members
for each row execute function public.set_updated_at();

create trigger event_invite_links_set_updated_at
before update on public.event_invite_links
for each row execute function public.set_updated_at();

insert into public.event_members (event_id, user_id, display_name, role, status)
select
  events.id,
  events.owner_user_id,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name', split_part(auth_user.email, '@', 1), '主催者'),
  'organizer',
  'joined'
from public.events
join auth.users as auth_user on auth_user.id = events.owner_user_id
on conflict (event_id, user_id) do nothing;

insert into public.event_invite_links (event_id, token, status, created_by_user_id)
select events.id, gen_random_uuid()::text, 'open', events.owner_user_id
from public.events
where not exists (
  select 1
  from public.event_invite_links
  where event_invite_links.event_id = events.id
    and event_invite_links.status = 'open'
);

alter table public.event_members enable row level security;
alter table public.event_invite_links enable row level security;

drop policy if exists "Owners can manage their events" on public.events;

create policy "Owners can manage their events"
on public.events
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Event members can view events"
on public.events
for select
to authenticated
using (
  exists (
    select 1
    from public.event_members
    where event_members.event_id = events.id
      and event_members.user_id = auth.uid()
      and event_members.status = 'joined'
  )
);

create policy "Owners can manage event members"
on public.event_members
for all
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = event_members.event_id
      and events.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = event_members.event_id
      and events.owner_user_id = auth.uid()
  )
);

create policy "Members can view their event membership"
on public.event_members
for select
to authenticated
using (user_id = auth.uid());

create policy "Owners can manage event invite links"
on public.event_invite_links
for all
to authenticated
using (
  exists (
    select 1
    from public.events
    where events.id = event_invite_links.event_id
      and events.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = event_invite_links.event_id
      and events.owner_user_id = auth.uid()
  )
);
