-- 退会時の DB クリーンアップを 1 トランザクションにまとめる RPC と、進行状態の列。
--
-- これまで lib/actions/account/account.ts は 11 個の delete と profiles / event_members の
-- update を Promise.all や逐次実行で走らせ、結果を一切確認していなかった。
-- 途中で失敗すると「退会完了と表示されたのに一部の個人データが残る」状態になっていた。
--
-- 退会は外部（Auth API・storage）も触るので全体を 1 トランザクションにはできない。
-- そこで「DB 側のクリーンアップ」だけをこの関数に閉じ込め、
-- profiles.deletion_state で進行状態を持たせて再実行できるようにする。

alter table public.profiles
  add column if not exists deletion_state text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_deletion_state_check;

alter table public.profiles
  add constraint profiles_deletion_state_check
  check (deletion_state in ('active', 'pending', 'done'));

comment on column public.profiles.deletion_state is
  'active=通常 / pending=退会処理中（外部処理が途中で失敗した可能性） / done=DBクリーンアップ完了。'
  '退会ゲートの判定には使わない（それは app_metadata.withdrawn_at）。';

-- ---------------------------------------------------------------------------
-- finalize_account_withdrawal
--   本人だけのデータを物理削除し、記録に残る表示名を匿名化する。
--   events / plans / expenses / settlements / participants / user_consents は残す。
--   何度呼んでも結果は同じ（delete は再実行可能、匿名化は再代入）。
--   service_role からのみ呼ぶ（呼び出し側の Server Action が退会確認を済ませている）。
-- ---------------------------------------------------------------------------
create or replace function public.finalize_account_withdrawal(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawn_name constant text := '退会したユーザー';
begin
  delete from public.user_connections where follower_user_id = target_user_id;
  delete from public.user_connections where followed_user_id = target_user_id;
  delete from public.user_favorites where user_id = target_user_id;
  delete from public.user_favorites where favorite_user_id = target_user_id;
  delete from public.user_blocks where blocker_user_id = target_user_id;
  delete from public.user_blocks where blocked_user_id = target_user_id;
  delete from public.event_user_invitations where inviter_user_id = target_user_id;
  delete from public.event_user_invitations where invitee_user_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.event_drafts where owner_user_id = target_user_id;
  delete from public.calendar_integrations where user_id = target_user_id;

  update public.event_members
  set display_name = v_withdrawn_name
  where user_id = target_user_id;

  update public.profiles
  set
    nickname = v_withdrawn_name,
    avatar_path = null,
    deleted_at = coalesce(deleted_at, now()),
    deletion_state = 'done'
  where user_id = target_user_id;
end;
$$;

revoke all on function public.finalize_account_withdrawal(uuid) from public;
revoke all on function public.finalize_account_withdrawal(uuid) from anon;
revoke all on function public.finalize_account_withdrawal(uuid) from authenticated;
grant execute on function public.finalize_account_withdrawal(uuid) to service_role;
