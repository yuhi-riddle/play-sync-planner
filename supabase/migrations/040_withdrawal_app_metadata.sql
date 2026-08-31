-- 既存の退会済みユーザーの印を app_metadata に移す。
-- 退会判定の正本は public.profiles.deleted_at のまま。このマイグレーションは profiles を変更しない。
-- middleware / Server Action が本人の書き換えられない印だけで退会を判定できるようにするための
-- 一度きりのバックフィル。既に印がある行には触れないので、何度実行しても結果は同じ。
--
-- これまでは lib/actions/account/account.ts が user_metadata.withdrawn_at に印を書いていたが、
-- user_metadata は本人が auth.updateUser() で書き換えられるため退会ゲートを回避できた。
-- 以降は app_metadata.withdrawn_at（service role のみ書ける）を印として使う。
-- 同意印（migration 026, legal_consent_accepted_at）と同じ構造。
update auth.users as u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'withdrawn_at',
       to_char(date_trunc('milliseconds', p.deleted_at at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     )
from public.profiles as p
where u.id = p.user_id
  and p.deleted_at is not null
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'withdrawn_at');
