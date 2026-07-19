begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

alter default privileges revoke execute on functions from public;
alter default privileges revoke execute on functions from anon;
alter default privileges in schema private grant execute on functions to service_role;

create or replace function private.is_event_owner(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events
    where public.events.id = target_event_id
      and public.events.owner_user_id = auth.uid()
  );
$$;

create or replace function private.is_joined_event_member(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members
    where public.event_members.event_id = target_event_id
      and public.event_members.user_id = auth.uid()
      and public.event_members.status = 'joined'
  );
$$;

create or replace function private.have_shared_event(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members as first_member
    join public.event_members as second_member
      on second_member.event_id = first_member.event_id
    where (auth.uid() = first_user_id or auth.uid() = second_user_id)
      and first_member.user_id = first_user_id
      and first_member.status = 'joined'
      and second_member.user_id = second_user_id
      and second_member.status = 'joined'
  );
$$;

create or replace function private.is_user_blocked(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_blocks
    where (auth.uid() = first_user_id or auth.uid() = second_user_id)
      and (
        (public.user_blocks.blocker_user_id = first_user_id and public.user_blocks.blocked_user_id = second_user_id)
       or (public.user_blocks.blocker_user_id = second_user_id and public.user_blocks.blocked_user_id = first_user_id)
      )
  );
$$;

create or replace function public.have_shared_event(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.event_members as first_member
    join public.event_members as second_member
      on second_member.event_id = first_member.event_id
    where (auth.uid() = first_user_id or auth.uid() = second_user_id)
      and first_member.user_id = first_user_id
      and first_member.status = 'joined'
      and second_member.user_id = second_user_id
      and second_member.status = 'joined'
  );
$$;

create or replace function public.is_user_blocked(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_blocks
    where (auth.uid() = first_user_id or auth.uid() = second_user_id)
      and (
        (public.user_blocks.blocker_user_id = first_user_id and public.user_blocks.blocked_user_id = second_user_id)
        or (public.user_blocks.blocker_user_id = second_user_id and public.user_blocks.blocked_user_id = first_user_id)
      )
  );
$$;

create or replace function public.is_following(
  follower_id uuid,
  followed_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_connections
    where (auth.uid() = follower_id or auth.uid() = followed_id)
      and public.user_connections.follower_user_id = follower_id
      and public.user_connections.followed_user_id = followed_id
  );
$$;

alter policy "Event members can view events"
on public.events
using (private.is_joined_event_member(id));

alter policy "Owners can manage event members"
on public.event_members
using (private.is_event_owner(event_id))
with check (private.is_event_owner(event_id));

alter policy "Owners can manage event invite links"
on public.event_invite_links
using (private.is_event_owner(event_id))
with check (private.is_event_owner(event_id));

alter policy "Users can manage their own connections"
on public.user_connections
using (follower_user_id = auth.uid())
with check (
  follower_user_id = auth.uid()
  and private.have_shared_event(follower_user_id, followed_user_id)
  and not private.is_user_blocked(follower_user_id, followed_user_id)
);

alter policy "Users can manage their own favorites"
on public.user_favorites
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_following(user_id, favorite_user_id)
  and private.have_shared_event(user_id, favorite_user_id)
  and not private.is_user_blocked(user_id, favorite_user_id)
);

alter policy "Event owners can view invitations"
on public.event_user_invitations
using (private.is_event_owner(event_id));

alter policy "Event owners can create pending invitations"
on public.event_user_invitations
with check (
  private.is_event_owner(event_id)
  and inviter_user_id = auth.uid()
  and status = 'pending'
  and private.have_shared_event(inviter_user_id, invitee_user_id)
  and not private.is_user_blocked(inviter_user_id, invitee_user_id)
);

alter policy "Event owners can revoke invitations"
on public.event_user_invitations
using (
  private.is_event_owner(event_id)
  and status in ('pending', 'revoked')
)
with check (
  private.is_event_owner(event_id)
  and inviter_user_id = auth.uid()
  and status in ('pending', 'revoked')
);

alter policy "Event owners can delete invitations"
on public.event_user_invitations
using (private.is_event_owner(event_id));

create or replace function public.block_user_atomic(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid block target';
  end if;

  if not private.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.user_connections
  where (follower_user_id = current_user_id and followed_user_id = target_user_id)
     or (follower_user_id = target_user_id and followed_user_id = current_user_id);

  delete from public.user_favorites
  where (user_id = current_user_id and favorite_user_id = target_user_id)
     or (user_id = target_user_id and favorite_user_id = current_user_id);
end;
$$;

revoke all on function public.is_event_owner(uuid) from public;
revoke all on function public.is_event_owner(uuid) from anon;
grant execute on function public.is_event_owner(uuid) to authenticated;
grant execute on function public.is_event_owner(uuid) to service_role;

revoke all on function public.is_joined_event_member(uuid) from public;
revoke all on function public.is_joined_event_member(uuid) from anon;
grant execute on function public.is_joined_event_member(uuid) to authenticated;
grant execute on function public.is_joined_event_member(uuid) to service_role;

revoke all on function public.have_shared_event(uuid, uuid) from public;
revoke all on function public.have_shared_event(uuid, uuid) from anon;
grant execute on function public.have_shared_event(uuid, uuid) to authenticated;
grant execute on function public.have_shared_event(uuid, uuid) to service_role;

revoke all on function public.is_user_blocked(uuid, uuid) from public;
revoke all on function public.is_user_blocked(uuid, uuid) from anon;
grant execute on function public.is_user_blocked(uuid, uuid) to authenticated;
grant execute on function public.is_user_blocked(uuid, uuid) to service_role;

revoke all on function public.is_following(uuid, uuid) from public;
revoke all on function public.is_following(uuid, uuid) from anon;
grant execute on function public.is_following(uuid, uuid) to authenticated;
grant execute on function public.is_following(uuid, uuid) to service_role;

revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint) from public;
revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint) from anon;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint) to authenticated;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint) to service_role;

revoke all on function public.block_user_atomic(uuid) from public;
revoke all on function public.block_user_atomic(uuid) from anon;
grant execute on function public.block_user_atomic(uuid) to authenticated;
grant execute on function public.block_user_atomic(uuid) to service_role;

revoke all on function private.is_event_owner(uuid) from public;
revoke all on function private.is_event_owner(uuid) from anon;
grant execute on function private.is_event_owner(uuid) to authenticated;
grant execute on function private.is_event_owner(uuid) to service_role;

revoke all on function private.is_joined_event_member(uuid) from public;
revoke all on function private.is_joined_event_member(uuid) from anon;
grant execute on function private.is_joined_event_member(uuid) to authenticated;
grant execute on function private.is_joined_event_member(uuid) to service_role;

revoke all on function private.have_shared_event(uuid, uuid) from public;
revoke all on function private.have_shared_event(uuid, uuid) from anon;
grant execute on function private.have_shared_event(uuid, uuid) to authenticated;
grant execute on function private.have_shared_event(uuid, uuid) to service_role;

revoke all on function private.is_user_blocked(uuid, uuid) from public;
revoke all on function private.is_user_blocked(uuid, uuid) from anon;
grant execute on function private.is_user_blocked(uuid, uuid) to authenticated;
grant execute on function private.is_user_blocked(uuid, uuid) to service_role;

commit;
