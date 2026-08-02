-- 既存ユーザーの同意印を app_metadata に移す。
-- middleware が user_consents を引かずに同意ゲートを通せるようにするための一度きりのバックフィル。
-- 同意の正本は public.user_consents のままで、このマイグレーションはテーブルを一切変更しない。
-- 既に印がある行には触れないので、何度実行しても結果は同じになる。
update auth.users as u
set raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'legal_consent_accepted_at',
       to_char(date_trunc('milliseconds', uc.agreed_at at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
     )
from public.user_consents as uc
where u.id = uc.user_id
  and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'legal_consent_accepted_at');
