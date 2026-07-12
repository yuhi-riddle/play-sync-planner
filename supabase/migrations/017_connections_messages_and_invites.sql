create table public.user_connections (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create table public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  favorite_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  check (user_id <> favorite_user_id)
);

create table public.event_user_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint event_user_invitations_status_check check (
    status in ('pending', 'accepted', 'declined', 'revoked')
  ),
  constraint event_user_invitations_no_self_invite_check check (
    inviter_user_id <> invitee_user_id
  )
);

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index user_connections_followed_user_id_idx
on public.user_connections(followed_user_id);

create index user_blocks_blocked_user_id_idx
on public.user_blocks(blocked_user_id);

create index user_favorites_favorite_user_id_idx
on public.user_favorites(favorite_user_id);

create index event_user_invitations_event_id_idx
on public.event_user_invitations(event_id);

create index event_user_invitations_inviter_user_id_idx
on public.event_user_invitations(inviter_user_id);

create index event_user_invitations_invitee_user_id_idx
on public.event_user_invitations(invitee_user_id);

create unique index event_user_invitations_one_pending_per_event_invitee_idx
on public.event_user_invitations(event_id, invitee_user_id)
where status = 'pending';

create index event_messages_event_id_created_at_idx
on public.event_messages(event_id, created_at);

create index event_messages_author_user_id_idx
on public.event_messages(author_user_id);

-- These helpers read RLS-protected event tables without reintroducing their
-- circular policy dependency. Their predicates are used from the new policies.
create or replace function public.have_shared_event(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_members as first_member
    join public.event_members as second_member
      on second_member.event_id = first_member.event_id
    where first_member.user_id = first_user_id
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
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where (blocker_user_id = first_user_id and blocked_user_id = second_user_id)
       or (blocker_user_id = second_user_id and blocked_user_id = first_user_id)
  );
$$;

create or replace function public.is_event_member(target_event_id uuid)
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

create or replace function public.protect_event_user_invitation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is distinct from old.event_id
    or new.inviter_user_id is distinct from old.inviter_user_id
    or new.invitee_user_id is distinct from old.invitee_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Invitation ownership cannot be changed';
  end if;

  if auth.uid() = old.invitee_user_id then
    if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
      raise exception 'Invitees can only accept or decline a pending invitation';
    end if;

    new.responded_at = now();
  end if;

  return new;
end;
$$;

revoke all on function public.have_shared_event(uuid, uuid) from public;
revoke all on function public.is_user_blocked(uuid, uuid) from public;
revoke all on function public.is_event_member(uuid) from public;
revoke all on function public.protect_event_user_invitation_update() from public;
grant execute on function public.have_shared_event(uuid, uuid) to authenticated;
grant execute on function public.is_user_blocked(uuid, uuid) to authenticated;
grant execute on function public.is_event_member(uuid) to authenticated;

alter table public.user_connections enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_favorites enable row level security;
alter table public.event_user_invitations enable row level security;
alter table public.event_messages enable row level security;

create policy "Users can manage their own connections"
on public.user_connections
for all
to authenticated
using (follower_user_id = auth.uid())
with check (
  follower_user_id = auth.uid()
  and public.have_shared_event(follower_user_id, followed_user_id)
  and not public.is_user_blocked(follower_user_id, followed_user_id)
);

create policy "Users can view connections involving them"
on public.user_connections
for select
to authenticated
using (
  follower_user_id = auth.uid()
  or followed_user_id = auth.uid()
);

create policy "Users can manage their own blocks"
on public.user_blocks
for all
to authenticated
using (blocker_user_id = auth.uid())
with check (blocker_user_id = auth.uid());

create policy "Users can manage their own favorites"
on public.user_favorites
for all
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.have_shared_event(user_id, favorite_user_id)
  and not public.is_user_blocked(user_id, favorite_user_id)
);

create policy "Event owners can view invitations"
on public.event_user_invitations
for select
to authenticated
using (public.is_event_owner(event_id));

create policy "Invitees can view their invitations"
on public.event_user_invitations
for select
to authenticated
using (invitee_user_id = auth.uid());

create policy "Event owners can create pending invitations"
on public.event_user_invitations
for insert
to authenticated
with check (
  public.is_event_owner(event_id)
  and inviter_user_id = auth.uid()
  and status = 'pending'
  and public.have_shared_event(inviter_user_id, invitee_user_id)
  and not public.is_user_blocked(inviter_user_id, invitee_user_id)
);

create trigger event_user_invitations_protect_update
before update on public.event_user_invitations
for each row execute function public.protect_event_user_invitation_update();

create policy "Event owners can revoke invitations"
on public.event_user_invitations
for update
to authenticated
using (
  public.is_event_owner(event_id)
  and status in ('pending', 'revoked')
)
with check (
  public.is_event_owner(event_id)
  and inviter_user_id = auth.uid()
  and status in ('pending', 'revoked')
);

create policy "Event owners can delete invitations"
on public.event_user_invitations
for delete
to authenticated
using (public.is_event_owner(event_id));

create policy "Invitees can respond to pending invitations"
on public.event_user_invitations
for update
to authenticated
using (
  invitee_user_id = auth.uid()
  and status = 'pending'
)
with check (
  invitee_user_id = auth.uid()
  and status in ('accepted', 'declined')
);

create policy "Event members can view messages"
on public.event_messages
for select
to authenticated
using (public.is_event_member(event_id));

create policy "Event members can post messages"
on public.event_messages
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and public.is_event_member(event_id)
);

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
    'event_message'
  )
);
