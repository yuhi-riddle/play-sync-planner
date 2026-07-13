create or replace function public.is_following(
  follower_id uuid,
  followed_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_connections
    where follower_user_id = follower_id
      and followed_user_id = followed_id
  );
$$;

revoke all on function public.is_following(uuid, uuid) from public;
grant execute on function public.is_following(uuid, uuid) to authenticated;

drop policy if exists "Users can manage their own favorites" on public.user_favorites;

create policy "Users can manage their own favorites"
on public.user_favorites
for all
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.is_following(user_id, favorite_user_id)
  and public.have_shared_event(user_id, favorite_user_id)
  and not public.is_user_blocked(user_id, favorite_user_id)
);
