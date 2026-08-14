-- イベント招待の作成・返答をRPC化し、レート制限と監査ログを追加する。
--
-- wip/legacy-helper-test の 023_rate_limits_and_security_audit.sql（528〜880行目）を
-- 移植したもの（docs/codex-branch-triage.md「取り込みの順番（案）」6番目の一部）。
--
-- 023からの変更点:
--   - migration 036と同じ理由で、エラーはマジックUUID/負の整数ではなく jsonb で返す。
--   - private.is_event_owner / private.is_user_blocked / private.have_shared_event
--     ではなく public. 版を使う（mainは021相当のprivateスキーマ移設を行っていない）。
--   - 023は複数の失敗理由を同じコード（-403や-409）にまとめていたが、
--     TypeScript側の既存メッセージがケースごとに異なるため、ここでは
--     エラーコードを分けて全て再現する（招待作成: 自分自身/未選択/非オーナー/
--     ブロック/対象外/既参加/招待済み、招待返答: 未検出/返答済み/ブロック/
--     共有イベント無し、をそれぞれ区別する）。
--   - respond_event_user_invitation の表示名解決は、023オリジナル版が
--     public.profiles.nickname を最優先していたが、現行アプリの
--     getUserDisplayName()（lib/domain/account/profile.ts）は
--     user_metadata.nickname を最優先しprofilesテーブルは見ない。
--     挙動を変えないため、getUserDisplayName() と同じ優先順位に合わせている。

begin;

-- ---------------------------------------------------------------------------
-- 招待の作成（イベントオーナー限定）
-- ---------------------------------------------------------------------------

create or replace function public.create_event_user_invitations(
  p_event_id uuid,
  p_invitee_user_ids uuid[]
)
returns jsonb
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
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  retry_seconds := private.try_consume_authenticated_rate_limit_once('event_invitation_create');
  if retry_seconds > 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds);
  end if;

  if p_event_id is null or cardinality(p_invitee_user_ids) not between 1 and 20 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select array_agg(distinct candidate)
  into normalized_invitee_user_ids
  from unnest(p_invitee_user_ids) as candidate
  where candidate is not null;

  if coalesce(cardinality(normalized_invitee_user_ids), 0) = 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'empty_selection');
  end if;

  if current_user_id = any(normalized_invitee_user_ids) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'self_invite');
  end if;

  if not public.is_event_owner(p_event_id) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  select public.events.title
  into event_title
  from public.events
  where public.events.id = p_event_id;

  foreach invitee_user_id in array normalized_invitee_user_ids loop
    if public.is_user_blocked(current_user_id, invitee_user_id) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'blocked');
    end if;

    if not (
      public.have_shared_event(current_user_id, invitee_user_id)
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
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'not_eligible');
    end if;

    if exists (
      select 1
      from public.event_members
      where public.event_members.event_id = p_event_id
        and public.event_members.user_id = invitee_user_id
        and public.event_members.status = 'joined'
    ) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'already_member');
    end if;

    if exists (
      select 1
      from public.event_user_invitations
      where public.event_user_invitations.event_id = p_event_id
        and public.event_user_invitations.invitee_user_id = invitee_user_id
        and public.event_user_invitations.status in ('pending', 'accepted')
    ) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'already_invited');
    end if;
  end loop;

  insert into public.event_user_invitations (event_id, inviter_user_id, invitee_user_id, status)
  select p_event_id, current_user_id, candidate, 'pending'
  from unnest(normalized_invitee_user_ids) as candidate;
  get diagnostics created_count = row_count;

  -- notifications.updated_at は before update トリガー（013）が自動で埋める。
  insert into public.notifications (user_id, kind, title, body, href, dedupe_key, read_at)
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
    read_at = null;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'success');

  return jsonb_build_object('ok', true, 'created_count', created_count);
end;
$$;

revoke all on function public.create_event_user_invitations(uuid, uuid[]) from public, anon;
grant execute on function public.create_event_user_invitations(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 招待への返答（承諾/辞退）
-- ---------------------------------------------------------------------------

create or replace function public.respond_event_user_invitation(
  p_invitation_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_record public.event_user_invitations%rowtype;
  member_display_name text;
  audit_operation text;
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  retry_seconds := private.try_consume_authenticated_rate_limit_once('event_invitation_respond');
  if retry_seconds > 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', p_invitation_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds);
  end if;

  if p_invitation_id is null or p_response not in ('accepted', 'declined') then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', p_invitation_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select public.event_user_invitations.*
  into invitation_record
  from public.event_user_invitations
  where public.event_user_invitations.id = p_invitation_id
    and public.event_user_invitations.invitee_user_id = current_user_id
    and public.event_user_invitations.status in ('pending', 'accepted')
  for update;

  if not found then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', p_invitation_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- 承諾済みの招待にもう一度「承諾」を送るのは、二重クリック等で普通に起こる。
  -- 現行TS実装と同じく、これはエラーではなく成功として扱う（べき等）。
  if invitation_record.status = 'accepted' and p_response = 'accepted' then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_accept', 'invitation', invitation_record.id, 'success');
    return jsonb_build_object('ok', true, 'event_id', invitation_record.event_id);
  end if;

  if invitation_record.status <> 'pending' then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', invitation_record.id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'already_responded');
  end if;

  if public.is_user_blocked(invitation_record.inviter_user_id, current_user_id) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', invitation_record.id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  if not public.have_shared_event(invitation_record.inviter_user_id, current_user_id) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_respond', 'invitation', invitation_record.id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_shared_event');
  end if;

  update public.event_user_invitations
  set status = p_response, responded_at = now()
  where public.event_user_invitations.id = invitation_record.id
    and public.event_user_invitations.status = 'pending';

  if p_response = 'accepted' then
    -- lib/domain/account/profile.ts の getUserDisplayName() と同じ優先順位
    -- （user_metadata.nickname → full_name → name → メールのローカル部 → 既定値）。
    -- profiles テーブルは見ない（現行アプリの挙動に合わせる）。
    select left(
      coalesce(
        nullif(trim(auth.users.raw_user_meta_data ->> 'nickname'), ''),
        nullif(trim(auth.users.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(auth.users.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(auth.users.email, ''), '@', 1), ''),
        '参加者'
      ),
      80
    )
    into member_display_name
    from auth.users
    where auth.users.id = current_user_id;

    insert into public.event_members (event_id, user_id, display_name, role, status)
    values (invitation_record.event_id, current_user_id, member_display_name, 'member', 'joined')
    on conflict (event_id, user_id) do update
    set display_name = excluded.display_name, role = 'member', status = 'joined', updated_at = now();
  end if;

  audit_operation := case p_response
    when 'accepted' then 'event_invitation_accept'
    else 'event_invitation_decline'
  end;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, audit_operation, 'invitation', invitation_record.id, 'success');

  return jsonb_build_object('ok', true, 'event_id', invitation_record.event_id);
end;
$$;

revoke all on function public.respond_event_user_invitation(uuid, text) from public, anon;
grant execute on function public.respond_event_user_invitation(uuid, text) to authenticated;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.respond_event_user_invitation(uuid, text);
-- drop function if exists public.create_event_user_invitations(uuid, uuid[]);
