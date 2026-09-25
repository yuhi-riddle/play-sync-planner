-- お気に入りを「お気に入り」グループへ移す。
-- 画面からお気に入りがなくなる PR①のデプロイ直後に本番へ適用する。
-- 関数にしてあるので、適用後に作られたお気に入りがあっても、もう一度呼べば足りる。
-- user_favorites 自体は PR④で消すまで残す。

begin;

create or replace function private.migrate_favorites_to_connection_groups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  -- 20グループの上限はここでは見ない（移行分は必ず作る）。
  insert into public.connection_groups (owner_user_id, name, color)
  select distinct favorite.user_id, 'お気に入り', 'nazotoki'
  from public.user_favorites as favorite
  on conflict (owner_user_id, name) do nothing;

  -- 30人の上限もここでは見ない。
  insert into public.connection_group_members (group_id, member_user_id)
  select favorite_group.id, favorite.favorite_user_id
  from public.user_favorites as favorite
  join public.connection_groups as favorite_group
    on favorite_group.owner_user_id = favorite.user_id
    and favorite_group.name = 'お気に入り'
  where not public.is_user_blocked(favorite.user_id, favorite.favorite_user_id)
  on conflict (group_id, member_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.migrate_favorites_to_connection_groups() from public;

select private.migrate_favorites_to_connection_groups();

commit;
