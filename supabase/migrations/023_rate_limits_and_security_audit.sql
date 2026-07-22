begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on schema private from service_role;

create table private.rate_limit_buckets (
  operation text not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (operation, subject_hash, window_started_at)
);

create table private.security_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  operation text not null,
  target_type text not null,
  target_id uuid,
  outcome text not null check (outcome in ('success', 'denied')),
  created_at timestamptz not null default now()
);

create index rate_limit_buckets_window_started_at_idx
on private.rate_limit_buckets(window_started_at);

create index security_audit_logs_created_at_idx
on private.security_audit_logs(created_at);

revoke all on table private.rate_limit_buckets from public;
revoke all on table private.rate_limit_buckets from anon;
revoke all on table private.rate_limit_buckets from authenticated;
revoke all on table private.rate_limit_buckets from service_role;
revoke all on table private.security_audit_logs from public;
revoke all on table private.security_audit_logs from anon;
revoke all on table private.security_audit_logs from authenticated;
revoke all on table private.security_audit_logs from service_role;
revoke all on sequence private.security_audit_logs_id_seq from public;
revoke all on sequence private.security_audit_logs_id_seq from anon;
revoke all on sequence private.security_audit_logs_id_seq from authenticated;
revoke all on sequence private.security_audit_logs_id_seq from service_role;

create or replace function private.rate_limit_for(p_operation text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_operation
    when 'event_message_post' then 20
    when 'google_availability' then 6
    when 'connection_update' then 30
    when 'event_invitation_create' then 30
    when 'event_invitation_respond' then 30
    when 'event_update' then 30
    when 'plan_update' then 30
    when 'event_member_update' then 30
    when 'profile_update' then 30
    when 'settlement_update' then 30
    when 'google_calendar_update' then 30
    when 'public_answer' then 10
    when 'public_payment' then 10
    else null
  end;
$$;

create or replace function private.consume_rate_limit(
  p_operation text,
  p_subject_hash bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_limit integer := private.rate_limit_for(p_operation);
  window_start timestamptz := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / 60) * 60
  );
  next_count integer;
  retry_seconds integer;
begin
  if operation_limit is null then
    raise exception using
      errcode = '22023',
      message = 'Unsupported rate limit operation';
  end if;

  if p_subject_hash is null or octet_length(p_subject_hash) <> 32 then
    raise exception using
      errcode = '22023',
      message = 'Invalid rate limit subject';
  end if;

  insert into private.rate_limit_buckets (
    operation,
    subject_hash,
    window_started_at,
    request_count
  )
  values (
    p_operation,
    p_subject_hash,
    window_start,
    1
  )
  on conflict (operation, subject_hash, window_started_at)
  do update
  set request_count = private.rate_limit_buckets.request_count + 1
  returning request_count into next_count;

  if next_count > operation_limit then
    retry_seconds := greatest(
      1,
      least(
        60,
        ceil(extract(epoch from (window_start + interval '60 seconds' - clock_timestamp())))::integer
      )
    );

    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = retry_seconds::text;
  end if;
end;
$$;

create or replace function public.consume_authenticated_rate_limit(operation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if operation in ('public_answer', 'public_payment') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported authenticated rate limit operation';
  end if;

  perform private.consume_rate_limit(
    operation,
    extensions.digest(current_user_id::text, 'sha256')
  );
end;
$$;

create or replace function public.consume_public_rate_limit(
  operation text,
  subject_hash bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Service role required';
  end if;

  if operation not in ('public_answer', 'public_payment') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported public rate limit operation';
  end if;

  perform private.consume_rate_limit(operation, subject_hash);
end;
$$;

create or replace function public.record_security_audit(
  operation text,
  target_type text,
  target_id uuid,
  outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := auth.role();
  audit_actor_user_id uuid;
begin
  if caller_role = 'service_role' then
    audit_actor_user_id := null;
  elsif auth.uid() is not null then
    audit_actor_user_id := auth.uid();
  else
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if outcome not in ('success', 'denied') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported audit outcome';
  end if;

  if operation not in (
    'connection_block',
    'connection_unblock',
    'event_invitation_create',
    'event_invitation_accept',
    'event_invitation_decline',
    'event_invitation_revoke',
    'event_member_join',
    'event_message_post',
    'public_answer',
    'public_payment',
    'settlement_payment_confirm',
    'google_calendar_connect',
    'google_calendar_disconnect',
    'rate_limit_denied'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Unsupported audit operation';
  end if;

  if target_type not in (
    'user',
    'event',
    'invitation',
    'message',
    'share_link',
    'settlement',
    'payment',
    'calendar_integration',
    'rate_limit'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Unsupported audit target';
  end if;

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    audit_actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  );
end;
$$;

create or replace function public.purge_expired_security_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_buckets integer;
  deleted_audits integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Service role required';
  end if;

  delete from private.rate_limit_buckets
  where window_started_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_buckets = row_count;

  delete from private.security_audit_logs
  where created_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_audits = row_count;

  return deleted_buckets + deleted_audits;
end;
$$;

create or replace function public.post_event_message(
  p_event_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  event_status text;
  event_title text;
  created_message_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_event_id is null
    or p_body is null
    or char_length(trim(p_body)) = 0
    or char_length(p_body) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid event message';
  end if;

  select public.events.status, public.events.title
  into event_status, event_title
  from public.events
  where public.events.id = p_event_id;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Event access denied';
  end if;

  if not private.is_joined_event_member(p_event_id) then
    raise exception using
      errcode = '42501',
      message = 'Event membership required';
  end if;

  if event_status = 'cancelled' then
    raise exception using
      errcode = '55000',
      message = 'Cancelled event';
  end if;

  perform private.consume_rate_limit(
    'event_message_post',
    extensions.digest(current_user_id::text, 'sha256')
  );

  insert into public.event_messages (
    event_id,
    author_user_id,
    body
  )
  values (
    p_event_id,
    current_user_id,
    trim(p_body)
  )
  returning id into created_message_id;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    href,
    dedupe_key,
    read_at
  )
  select
    public.event_members.user_id,
    'event_message',
    event_title || ' に新しいメッセージがあります',
    'イベント参加者から新しいメッセージがあります。',
    '/events/' || p_event_id::text || '#chat',
    'event-message:' || p_event_id::text || ':' || public.event_members.user_id::text,
    null
  from public.event_members
  where public.event_members.event_id = p_event_id
    and public.event_members.status = 'joined'
    and public.event_members.user_id <> current_user_id
  on conflict (user_id, dedupe_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    read_at = null,
    updated_at = now();

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    'event_message_post',
    'message',
    created_message_id,
    'success'
  );

  return created_message_id;
end;
$$;

create or replace function public.create_event_user_invitations(
  p_event_id uuid,
  p_invitee_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invitee_user_ids uuid[];
  event_title text;
  invitee_user_id uuid;
  created_count integer;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_event_id is null
    or cardinality(p_invitee_user_ids) not between 1 and 20 then
    raise exception using
      errcode = '22023',
      message = 'Invalid invitation targets';
  end if;

  select array_agg(distinct candidate)
  into normalized_invitee_user_ids
  from unnest(p_invitee_user_ids) as candidate
  where candidate is not null;

  if coalesce(cardinality(normalized_invitee_user_ids), 0) = 0
    or current_user_id = any(normalized_invitee_user_ids) then
    raise exception using
      errcode = '22023',
      message = 'Invalid invitation targets';
  end if;

  if not private.is_event_owner(p_event_id) then
    raise exception using
      errcode = '42501',
      message = 'Event owner required';
  end if;

  select public.events.title
  into event_title
  from public.events
  where public.events.id = p_event_id;

  foreach invitee_user_id in array normalized_invitee_user_ids loop
    if private.is_user_blocked(current_user_id, invitee_user_id) then
      raise exception using
        errcode = '42501',
        message = 'Blocked invitation target';
    end if;

    if not (
      private.have_shared_event(current_user_id, invitee_user_id)
      or exists (
        select 1
        from public.user_connections
        where public.user_connections.follower_user_id = current_user_id
          and public.user_connections.followed_user_id = invitee_user_id
      )
      or exists (
        select 1
        from public.user_favorites
        where public.user_favorites.user_id = current_user_id
          and public.user_favorites.favorite_user_id = invitee_user_id
      )
    ) then
      raise exception using
        errcode = '42501',
        message = 'Ineligible invitation target';
    end if;

    if exists (
      select 1
      from public.event_members
      where public.event_members.event_id = p_event_id
        and public.event_members.user_id = invitee_user_id
        and public.event_members.status = 'joined'
    ) then
      raise exception using
        errcode = '23505',
        message = 'Existing event member';
    end if;

    if exists (
      select 1
      from public.event_user_invitations
      where public.event_user_invitations.event_id = p_event_id
        and public.event_user_invitations.invitee_user_id = invitee_user_id
        and public.event_user_invitations.status in ('pending', 'accepted')
    ) then
      raise exception using
        errcode = '23505',
        message = 'Existing event invitation';
    end if;
  end loop;

  perform private.consume_rate_limit(
    'event_invitation_create',
    extensions.digest(current_user_id::text, 'sha256')
  );

  insert into public.event_user_invitations (
    event_id,
    inviter_user_id,
    invitee_user_id,
    status
  )
  select
    p_event_id,
    current_user_id,
    candidate,
    'pending'
  from unnest(normalized_invitee_user_ids) as candidate;
  get diagnostics created_count = row_count;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    href,
    dedupe_key,
    read_at
  )
  select
    candidate,
    'event_invitation',
    event_title || ' に招待されました',
    'Madoiでイベントへの招待が届いています。',
    '/connections',
    'event-invitation:' || p_event_id::text || ':' || candidate::text,
    null
  from unnest(normalized_invitee_user_ids) as candidate
  on conflict (user_id, dedupe_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    read_at = null,
    updated_at = now();

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    'event_invitation_create',
    'event',
    p_event_id,
    'success'
  );

  return created_count;
end;
$$;

create or replace function public.respond_event_user_invitation(
  p_invitation_id uuid,
  p_response text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_record public.event_user_invitations%rowtype;
  member_display_name text;
  audit_operation text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_invitation_id is null or p_response not in ('accepted', 'declined') then
    raise exception using
      errcode = '22023',
      message = 'Invalid invitation response';
  end if;

  select public.event_user_invitations.*
  into invitation_record
  from public.event_user_invitations
  where public.event_user_invitations.id = p_invitation_id
    and public.event_user_invitations.invitee_user_id = current_user_id
    and public.event_user_invitations.status in ('pending', 'accepted')
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Invitation response denied';
  end if;

  if invitation_record.status = 'accepted' and p_response = 'accepted' then
    return invitation_record.event_id;
  end if;

  if invitation_record.status <> 'pending' then
    raise exception using
      errcode = '55000',
      message = 'Invitation already answered';
  end if;

  if private.is_user_blocked(invitation_record.inviter_user_id, current_user_id)
    or not private.have_shared_event(invitation_record.inviter_user_id, current_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Invitation relationship denied';
  end if;

  perform private.consume_rate_limit(
    'event_invitation_respond',
    extensions.digest(current_user_id::text, 'sha256')
  );

  update public.event_user_invitations
  set
    status = p_response,
    responded_at = now()
  where public.event_user_invitations.id = invitation_record.id
    and public.event_user_invitations.status = 'pending';

  if p_response = 'accepted' then
    select left(
      coalesce(
        nullif(trim(public.profiles.nickname), ''),
        nullif(trim(auth.users.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(auth.users.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(auth.users.email, ''), '@', 1), ''),
        '参加者'
      ),
      80
    )
    into member_display_name
    from auth.users
    left join public.profiles on public.profiles.user_id = auth.users.id
    where auth.users.id = current_user_id;

    insert into public.event_members (
      event_id,
      user_id,
      display_name,
      role,
      status
    )
    values (
      invitation_record.event_id,
      current_user_id,
      member_display_name,
      'member',
      'joined'
    )
    on conflict (event_id, user_id) do update
    set
      display_name = excluded.display_name,
      role = 'member',
      status = 'joined',
      updated_at = now();
  end if;

  audit_operation := case p_response
    when 'accepted' then 'event_invitation_accept'
    else 'event_invitation_decline'
  end;

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    audit_operation,
    'invitation',
    invitation_record.id,
    'success'
  );

  return invitation_record.event_id;
end;
$$;

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
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception using
      errcode = '22023',
      message = 'Invalid block target';
  end if;

  if not private.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  perform private.consume_rate_limit(
    'connection_update',
    extensions.digest(current_user_id::text, 'sha256')
  );

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.user_connections
  where (follower_user_id = current_user_id and followed_user_id = target_user_id)
     or (follower_user_id = target_user_id and followed_user_id = current_user_id);

  delete from public.user_favorites
  where (user_id = current_user_id and favorite_user_id = target_user_id)
     or (user_id = target_user_id and favorite_user_id = current_user_id);

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    'connection_block',
    'user',
    target_user_id,
    'success'
  );
end;
$$;

create or replace function public.get_event_calendar_integrations(p_event_id uuid)
returns table (
  user_id uuid,
  calendar_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  event_status text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  select public.events.status
  into event_status
  from public.events
  where public.events.id = p_event_id
    and public.events.owner_user_id = current_user_id;

  if not found
    or not private.is_event_owner(p_event_id)
    or event_status not in ('interested', 'planning') then
    raise exception using
      errcode = '42501',
      message = 'Event owner access required';
  end if;

  return query
  select
    public.event_members.user_id,
    public.calendar_integrations.calendar_id,
    public.calendar_integrations.encrypted_access_token,
    public.calendar_integrations.encrypted_refresh_token,
    public.calendar_integrations.token_expires_at
  from public.event_members
  left join public.calendar_integrations
    on public.calendar_integrations.user_id = public.event_members.user_id
   and public.calendar_integrations.provider = 'google'
  where public.event_members.event_id = p_event_id
    and public.event_members.status = 'joined'
  order by public.event_members.user_id;
end;
$$;

create or replace function public.get_plan_calendar_attendee_emails(p_plan_id uuid)
returns table (account_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.plans
    where public.plans.id = p_plan_id
      and public.plans.owner_user_id = current_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Plan owner access required';
  end if;

  return query
  select distinct public.calendar_integrations.account_email
  from public.participants
  join public.calendar_integrations
    on public.calendar_integrations.user_id = public.participants.user_id
   and public.calendar_integrations.provider = 'google'
  where public.participants.plan_id = p_plan_id
    and public.participants.status = 'confirmed'
    and public.participants.user_id <> current_user_id
    and public.calendar_integrations.account_email is not null
  order by public.calendar_integrations.account_email;
end;
$$;

create or replace function public.join_event_from_invite(
  p_token text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_event_id uuid;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_token is null
    or char_length(p_token) > 128
    or p_display_name is null
    or char_length(trim(p_display_name)) not between 1 and 80 then
    raise exception using
      errcode = '22023',
      message = 'Invalid invite input';
  end if;

  select public.event_invite_links.event_id
  into target_event_id
  from public.event_invite_links
  where public.event_invite_links.token = p_token
    and public.event_invite_links.status = 'open';

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Invite unavailable';
  end if;

  if not exists (
    select 1
    from public.calendar_integrations
    where public.calendar_integrations.user_id = current_user_id
      and public.calendar_integrations.provider = 'google'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Calendar integration required';
  end if;

  perform private.consume_rate_limit(
    'event_member_update',
    extensions.digest(current_user_id::text, 'sha256')
  );

  insert into public.event_members (
    event_id,
    user_id,
    display_name,
    role,
    status
  )
  values (
    target_event_id,
    current_user_id,
    trim(p_display_name),
    'member',
    'joined'
  )
  on conflict (event_id, user_id) do update
  set
    display_name = excluded.display_name,
    role = 'member',
    status = 'joined',
    updated_at = now();

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    'event_member_join',
    'event',
    target_event_id,
    'success'
  );

  return target_event_id;
end;
$$;

create or replace function public.restart_plan_adjustment(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_event_id uuid;
  plan_title text;
  restart_key text := clock_timestamp()::text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  select public.plans.event_id, public.plans.title
  into target_event_id, plan_title
  from public.plans
  where public.plans.id = p_plan_id
    and public.plans.owner_user_id = current_user_id
  for update;

  if not found or not private.is_event_owner(target_event_id) then
    raise exception using
      errcode = '42501',
      message = 'Plan owner access required';
  end if;

  perform private.consume_rate_limit(
    'plan_update',
    extensions.digest(current_user_id::text, 'sha256')
  );

  delete from public.availability_answers
  where public.availability_answers.candidate_date_id in (
    select public.candidate_dates.id
    from public.candidate_dates
    where public.candidate_dates.plan_id = p_plan_id
  );

  update public.plans
  set
    status = 'collecting_answers',
    confirmed_start_at = null,
    confirmed_end_at = null,
    is_all_day = false
  where public.plans.id = p_plan_id;

  update public.events
  set status = 'planning'
  where public.events.id = target_event_id;

  update public.participants
  set status = 'invited'
  where public.participants.plan_id = p_plan_id;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    href,
    dedupe_key,
    read_at
  )
  select
    public.participants.user_id,
    'unanswered',
    '未回答者がいます',
    coalesce(nullif(trim(plan_title), ''), '日程調整') || ' の回答受付を再開しました。',
    '/plans/' || p_plan_id::text,
    'unanswered:' || p_plan_id::text || ':restart:' || restart_key,
    null
  from public.participants
  where public.participants.plan_id = p_plan_id
    and public.participants.user_id is not null
  on conflict (user_id, dedupe_key) do nothing;

  return target_event_id;
end;
$$;

create or replace function public.record_settlement_payment(
  p_settlement_id uuid,
  p_amount integer,
  p_payment_method text,
  p_payment_url text,
  p_memo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_plan_id uuid;
  from_participant_id uuid;
  to_user_id uuid;
  settlement_amount integer;
  paid_amount integer;
  created_payment_id uuid;
  notification_title text;
  payer_name text;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0
    or char_length(coalesce(p_payment_method, '')) > 100
    or char_length(coalesce(p_payment_url, '')) > 2048
    or char_length(coalesce(p_memo, '')) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'Invalid settlement payment';
  end if;

  select
    target_settlement.plan_id,
    target_settlement.from_participant_id,
    target_settlement.amount,
    receiver.user_id,
    payer.display_name,
    coalesce(nullif(trim(public.events.title), ''), nullif(trim(public.plans.title), ''), '日程調整')
  into
    target_plan_id,
    from_participant_id,
    settlement_amount,
    to_user_id,
    payer_name,
    notification_title
  from public.settlements as target_settlement
  join public.plans on public.plans.id = target_settlement.plan_id
  join public.events on public.events.id = public.plans.event_id
  join public.participants as payer on payer.id = target_settlement.from_participant_id
  join public.participants as receiver on receiver.id = target_settlement.to_participant_id
  where target_settlement.id = p_settlement_id
    and public.plans.owner_user_id = current_user_id
  for update of target_settlement;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Settlement owner access required';
  end if;

  select coalesce(sum(public.settlement_payments.amount), 0)::integer
  into paid_amount
  from public.settlement_payments
  where public.settlement_payments.settlement_id = p_settlement_id;

  if p_amount > settlement_amount - paid_amount then
    raise exception using
      errcode = '22023',
      message = 'Settlement payment exceeds remaining amount';
  end if;

  perform private.consume_rate_limit(
    'settlement_update',
    extensions.digest(current_user_id::text, 'sha256')
  );

  insert into public.settlement_payments (
    settlement_id,
    paid_by_participant_id,
    amount,
    payment_method,
    payment_url,
    memo
  )
  values (
    p_settlement_id,
    from_participant_id,
    p_amount,
    nullif(trim(p_payment_method), ''),
    nullif(trim(p_payment_url), ''),
    nullif(trim(p_memo), '')
  )
  returning id into created_payment_id;

  update public.settlements
  set
    status = case when paid_amount + p_amount >= settlement_amount then 'paid' else 'unpaid' end,
    paid_at = now()
  where public.settlements.id = p_settlement_id;

  update public.plans
  set settlement_status = 'settling'
  where public.plans.id = target_plan_id;

  if to_user_id is not null then
    insert into public.notifications (
      user_id,
      kind,
      title,
      body,
      href,
      dedupe_key
    )
    values (
      to_user_id,
      'confirmation_due',
      '受け取り確認待ちがあります',
      notification_title || ' で ' || coalesce(nullif(trim(payer_name), ''), '参加者') || 'さんの受け取り確認待ちがあります。',
      '/plans/' || target_plan_id::text || '/settlement#confirmation',
      'confirmation_due:' || target_plan_id::text || ':payment:' || created_payment_id::text
    )
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return target_plan_id;
end;
$$;

create or replace function public.confirm_settlement_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_settlement_id uuid;
  target_plan_id uuid;
  settlement_amount integer;
  paid_amount integer;
  confirmed_amount integer;
  confirmed_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  select
    target_payment.settlement_id,
    target_settlement.plan_id,
    target_settlement.amount
  into
    target_settlement_id,
    target_plan_id,
    settlement_amount
  from public.settlement_payments as target_payment
  join public.settlements as target_settlement
    on target_settlement.id = target_payment.settlement_id
  join public.participants as receiver
    on receiver.id = target_settlement.to_participant_id
  where target_payment.id = p_payment_id
    and receiver.user_id = current_user_id
  for update of target_payment, target_settlement;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Settlement confirmation access required';
  end if;

  perform private.consume_rate_limit(
    'settlement_update',
    extensions.digest(current_user_id::text, 'sha256')
  );

  update public.settlement_payments
  set confirmed_at = coalesce(confirmed_at, confirmed_time)
  where public.settlement_payments.id = p_payment_id;

  select
    coalesce(sum(public.settlement_payments.amount), 0)::integer,
    coalesce(sum(public.settlement_payments.amount) filter (
      where public.settlement_payments.confirmed_at is not null
    ), 0)::integer
  into paid_amount, confirmed_amount
  from public.settlement_payments
  where public.settlement_payments.settlement_id = target_settlement_id;

  update public.settlements
  set
    status = case
      when confirmed_amount >= settlement_amount then 'confirmed'
      when paid_amount >= settlement_amount then 'paid'
      else 'unpaid'
    end,
    confirmed_at = case when confirmed_amount >= settlement_amount then confirmed_time else null end
  where public.settlements.id = target_settlement_id;

  update public.plans
  set settlement_status = case
    when not exists (
      select 1
      from public.settlements
      where public.settlements.plan_id = target_plan_id
        and public.settlements.status <> 'confirmed'
    ) then 'settled'
    else 'settling'
  end
  where public.plans.id = target_plan_id;

  update public.notifications
  set read_at = confirmed_time
  where public.notifications.user_id = current_user_id
    and public.notifications.dedupe_key =
      'confirmation_due:' || target_plan_id::text || ':payment:' || p_payment_id::text
    and public.notifications.read_at is null;

  insert into private.security_audit_logs (
    actor_user_id,
    operation,
    target_type,
    target_id,
    outcome
  )
  values (
    current_user_id,
    'settlement_payment_confirm',
    'payment',
    p_payment_id,
    'success'
  );

  return target_plan_id;
end;
$$;

create or replace function public.get_settlement_page_data(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception using
      errcode = '28000',
      message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.plans
    where public.plans.id = p_plan_id
      and (
        public.plans.owner_user_id = current_user_id
        or exists (
          select 1
          from public.participants
          where public.participants.plan_id = p_plan_id
            and public.participants.user_id = current_user_id
        )
      )
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'id', public.plans.id,
    'title', public.plans.title,
    'owner_user_id', public.plans.owner_user_id,
    'events', (
      select jsonb_build_object('id', public.events.id, 'title', public.events.title)
      from public.events
      where public.events.id = public.plans.event_id
    ),
    'share_links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token', public.share_links.token,
        'purpose', public.share_links.purpose
      ))
      from public.share_links
      where public.share_links.plan_id = public.plans.id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', public.participants.id,
        'display_name', public.participants.display_name,
        'status', public.participants.status,
        'user_id', public.participants.user_id
      ))
      from public.participants
      where public.participants.plan_id = public.plans.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', expense.id,
        'title', expense.title,
        'amount', expense.amount,
        'paid_at', expense.paid_at,
        'memo', expense.memo,
        'payment_method', expense.payment_method,
        'payment_url', expense.payment_url,
        'is_important', expense.is_important,
        'payer_participant_id', expense.payer_participant_id,
        'payer', (
          select jsonb_build_object(
            'id', payer.id,
            'display_name', payer.display_name,
            'user_id', payer.user_id
          )
          from public.participants as payer
          where payer.id = expense.payer_participant_id
        ),
        'expense_splits', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', split.id,
            'participant_id', split.participant_id,
            'amount', split.amount,
            'participants', (
              select jsonb_build_object(
                'id', split_participant.id,
                'display_name', split_participant.display_name,
                'user_id', split_participant.user_id
              )
              from public.participants as split_participant
              where split_participant.id = split.participant_id
            )
          ))
          from public.expense_splits as split
          where split.expense_id = expense.id
        ), '[]'::jsonb)
      ))
      from public.expenses as expense
      where expense.plan_id = public.plans.id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', settlement.id,
        'amount', settlement.amount,
        'status', settlement.status,
        'payment_method', settlement.payment_method,
        'payment_url', settlement.payment_url,
        'memo', settlement.memo,
        'paid_at', settlement.paid_at,
        'confirmed_at', settlement.confirmed_at,
        'from_participant', (
          select jsonb_build_object(
            'id', from_participant.id,
            'display_name', from_participant.display_name,
            'user_id', from_participant.user_id
          )
          from public.participants as from_participant
          where from_participant.id = settlement.from_participant_id
        ),
        'to_participant', (
          select jsonb_build_object(
            'id', to_participant.id,
            'display_name', to_participant.display_name,
            'user_id', to_participant.user_id
          )
          from public.participants as to_participant
          where to_participant.id = settlement.to_participant_id
        ),
        'settlement_payments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', payment.id,
            'amount', payment.amount,
            'payment_method', payment.payment_method,
            'payment_url', payment.payment_url,
            'memo', payment.memo,
            'paid_at', payment.paid_at,
            'confirmed_at', payment.confirmed_at,
            'paid_by', (
              select jsonb_build_object(
                'id', paid_by.id,
                'display_name', paid_by.display_name,
                'user_id', paid_by.user_id
              )
              from public.participants as paid_by
              where paid_by.id = payment.paid_by_participant_id
            )
          ))
          from public.settlement_payments as payment
          where payment.settlement_id = settlement.id
        ), '[]'::jsonb)
      ))
      from public.settlements as settlement
      where settlement.plan_id = public.plans.id
    ), '[]'::jsonb),
    'settlement_reminder_logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sent_at', public.settlement_reminder_logs.sent_at,
        'recipient_names', public.settlement_reminder_logs.recipient_names,
        'reminder_message', public.settlement_reminder_logs.reminder_message,
        'reminder_type', public.settlement_reminder_logs.reminder_type
      ))
      from public.settlement_reminder_logs
      where public.settlement_reminder_logs.plan_id = public.plans.id
    ), '[]'::jsonb)
  )
  into result
  from public.plans
  where public.plans.id = p_plan_id;

  return result;
end;
$$;

revoke all on function private.rate_limit_for(text) from public;
revoke all on function private.rate_limit_for(text) from anon;
revoke all on function private.rate_limit_for(text) from authenticated;
revoke all on function private.rate_limit_for(text) from service_role;
revoke all on function private.consume_rate_limit(text, bytea) from public;
revoke all on function private.consume_rate_limit(text, bytea) from anon;
revoke all on function private.consume_rate_limit(text, bytea) from authenticated;
revoke all on function private.consume_rate_limit(text, bytea) from service_role;

revoke all on function public.consume_authenticated_rate_limit(text) from public;
revoke all on function public.consume_authenticated_rate_limit(text) from anon;
revoke all on function public.consume_authenticated_rate_limit(text) from service_role;
grant execute on function public.consume_authenticated_rate_limit(text) to authenticated;

revoke all on function public.consume_public_rate_limit(text, bytea) from public;
revoke all on function public.consume_public_rate_limit(text, bytea) from anon;
revoke all on function public.consume_public_rate_limit(text, bytea) from authenticated;
grant execute on function public.consume_public_rate_limit(text, bytea) to service_role;

revoke all on function public.record_security_audit(text, text, uuid, text) from public;
revoke all on function public.record_security_audit(text, text, uuid, text) from anon;
grant execute on function public.record_security_audit(text, text, uuid, text) to authenticated;
grant execute on function public.record_security_audit(text, text, uuid, text) to service_role;

revoke all on function public.purge_expired_security_data() from public;
revoke all on function public.purge_expired_security_data() from anon;
revoke all on function public.purge_expired_security_data() from authenticated;
grant execute on function public.purge_expired_security_data() to service_role;

revoke all on function public.post_event_message(uuid, text) from public;
revoke all on function public.post_event_message(uuid, text) from anon;
revoke all on function public.post_event_message(uuid, text) from service_role;
grant execute on function public.post_event_message(uuid, text) to authenticated;

revoke all on function public.create_event_user_invitations(uuid, uuid[]) from public;
revoke all on function public.create_event_user_invitations(uuid, uuid[]) from anon;
revoke all on function public.create_event_user_invitations(uuid, uuid[]) from service_role;
grant execute on function public.create_event_user_invitations(uuid, uuid[]) to authenticated;

revoke all on function public.respond_event_user_invitation(uuid, text) from public;
revoke all on function public.respond_event_user_invitation(uuid, text) from anon;
revoke all on function public.respond_event_user_invitation(uuid, text) from service_role;
grant execute on function public.respond_event_user_invitation(uuid, text) to authenticated;

revoke all on function public.block_user_atomic(uuid) from public;
revoke all on function public.block_user_atomic(uuid) from anon;
revoke all on function public.block_user_atomic(uuid) from service_role;
grant execute on function public.block_user_atomic(uuid) to authenticated;

revoke all on function public.get_event_calendar_integrations(uuid) from public;
revoke all on function public.get_event_calendar_integrations(uuid) from anon;
revoke all on function public.get_event_calendar_integrations(uuid) from service_role;
grant execute on function public.get_event_calendar_integrations(uuid) to authenticated;

revoke all on function public.get_plan_calendar_attendee_emails(uuid) from public;
revoke all on function public.get_plan_calendar_attendee_emails(uuid) from anon;
revoke all on function public.get_plan_calendar_attendee_emails(uuid) from service_role;
grant execute on function public.get_plan_calendar_attendee_emails(uuid) to authenticated;

revoke all on function public.join_event_from_invite(text, text) from public;
revoke all on function public.join_event_from_invite(text, text) from anon;
revoke all on function public.join_event_from_invite(text, text) from service_role;
grant execute on function public.join_event_from_invite(text, text) to authenticated;

revoke all on function public.restart_plan_adjustment(uuid) from public;
revoke all on function public.restart_plan_adjustment(uuid) from anon;
revoke all on function public.restart_plan_adjustment(uuid) from service_role;
grant execute on function public.restart_plan_adjustment(uuid) to authenticated;

revoke all on function public.record_settlement_payment(uuid, integer, text, text, text) from public;
revoke all on function public.record_settlement_payment(uuid, integer, text, text, text) from anon;
revoke all on function public.record_settlement_payment(uuid, integer, text, text, text) from service_role;
grant execute on function public.record_settlement_payment(uuid, integer, text, text, text) to authenticated;

revoke all on function public.confirm_settlement_payment(uuid) from public;
revoke all on function public.confirm_settlement_payment(uuid) from anon;
revoke all on function public.confirm_settlement_payment(uuid) from service_role;
grant execute on function public.confirm_settlement_payment(uuid) to authenticated;

revoke all on function public.get_settlement_page_data(uuid) from public;
revoke all on function public.get_settlement_page_data(uuid) from anon;
revoke all on function public.get_settlement_page_data(uuid) from service_role;
grant execute on function public.get_settlement_page_data(uuid) to authenticated;

commit;
