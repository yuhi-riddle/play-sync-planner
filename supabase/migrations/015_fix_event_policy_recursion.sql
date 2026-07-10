-- Event member policies used to read events, while the event visibility policy
-- read event_members. PostgreSQL evaluates both RLS policies and detects that
-- cycle as an infinite recursion. Keep the checks in security-definer helpers.
create or replace function public.is_event_owner(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events
    where events.id = target_event_id
      and events.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_joined_event_member(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members
    where event_members.event_id = target_event_id
      and event_members.user_id = auth.uid()
      and event_members.status = 'joined'
  );
$$;

revoke all on function public.is_event_owner(uuid) from public;
revoke all on function public.is_joined_event_member(uuid) from public;
grant execute on function public.is_event_owner(uuid) to authenticated;
grant execute on function public.is_joined_event_member(uuid) to authenticated;

drop policy if exists "Event members can view events" on public.events;
drop policy if exists "Owners can manage event members" on public.event_members;
drop policy if exists "Owners can manage event invite links" on public.event_invite_links;

create policy "Event members can view events"
on public.events
for select
to authenticated
using (public.is_joined_event_member(id));

create policy "Owners can manage event members"
on public.event_members
for all
to authenticated
using (public.is_event_owner(event_id))
with check (public.is_event_owner(event_id));

create policy "Owners can manage event invite links"
on public.event_invite_links
for all
to authenticated
using (public.is_event_owner(event_id))
with check (public.is_event_owner(event_id));
