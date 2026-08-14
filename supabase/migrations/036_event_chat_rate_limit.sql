-- チャット投稿（post_event_message）をRPC化し、レート制限と監査ログを追加する。
--
-- wip/legacy-helper-test の 023_rate_limits_and_security_audit.sql（390〜527行目）を
-- 移植したもの（docs/codex-branch-triage.md「取り込みの順番（案）」6番目の一部）。
-- migration 035 で追加した private.try_consume_authenticated_rate_limit_once /
-- private.security_audit_logs を使う。
--
-- 023からの変更点:
--   - エラーはマジックUUID（'...0429'等）ではなく jsonb で返す。ok/error/
--     retry_after_seconds を持たせ、TypeScript側で分岐しやすくする。
--     例外を投げると監査ログのinsertごとロールバックされてしまうため
--     （denyケースでも監査ログを残したい）、成功/失敗とも正常returnにしている。
--   - private.is_joined_event_member ではなく public.is_joined_event_member を使う
--     （mainでは021相当のprivateスキーマ移設を行っていないため。015で定義済み）。
--
-- lib/actions/event/event-messages.ts の createEventMessageAction は現状、
-- events/event_members/notifications へ複数回クエリしている。このRPCに置き換えると
-- 1回のトランザクションにまとまり、かつレート制限（20回/分・ユーザー単位）が付く。

begin;

create or replace function public.post_event_message(
  p_event_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  event_status text;
  event_title text;
  created_message_id uuid;
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  retry_seconds := private.try_consume_authenticated_rate_limit_once('event_message_post');
  if retry_seconds > 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_message_post', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds);
  end if;

  if p_event_id is null or p_body is null or char_length(trim(p_body)) = 0 or char_length(p_body) > 2000 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_message_post', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'invalid_body');
  end if;

  select public.events.status, public.events.title
  into event_status, event_title
  from public.events
  where public.events.id = p_event_id;

  if not found then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_message_post', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not public.is_joined_event_member(p_event_id) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_message_post', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if event_status = 'cancelled' then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_message_post', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;

  insert into public.event_messages (event_id, author_user_id, body)
  values (p_event_id, current_user_id, trim(p_body))
  returning id into created_message_id;

  -- 通知作成の失敗で投稿自体を失敗させない。旧TS実装（createEventMessageAction）も
  -- ここは console.error するだけで投稿は成功扱いにしていた。例外ブロックは
  -- 暗黙のsavepointを作るので、ここで失敗してもevent_messagesへのinsertは残る。
  -- notifications.updated_at は before update トリガー（013）が自動で埋める。
  begin
    insert into public.notifications (user_id, kind, title, body, href, dedupe_key, read_at)
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
      read_at = null;
  exception
    when others then
      null;
  end;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'event_message_post', 'message', created_message_id, 'success');

  return jsonb_build_object('ok', true, 'message_id', created_message_id);
end;
$$;

revoke all on function public.post_event_message(uuid, text) from public, anon;
grant execute on function public.post_event_message(uuid, text) to authenticated;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.post_event_message(uuid, text);
