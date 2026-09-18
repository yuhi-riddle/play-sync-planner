-- pgcryptoのdigest()が本番で解決できていなかったバグの修正。
--
-- 本番のSupabaseはpgcrypto拡張を`extensions`スキーマにインストールする
-- （`select extnamespace::regnamespace from pg_extension where extname = 'pgcrypto'`
-- で確認済み）。033/035の該当関数はどちらもsearch_pathに`extensions`を
-- 含めておらず（035は''、033は`public, private`）、非修飾の`digest(...)`呼び出しが
-- 本番でのみ解決に失敗していた（CIは`scripts/ci-bootstrap-db.sql`がpgcryptoを
-- publicへ入れるため気づけなかった）。
--
-- 実際の影響:
--   - private.try_consume_authenticated_rate_limit_once（035）経由で
--     follow_user_atomic等が失敗し、フォロー操作がエラーになっていた（本番で確認済み）。
--   - public.record_web_vital（033）も同じ理由で本番では常に失敗していた可能性が高い
--     （クライアント側はビーコン送信でエラーを表面化しないため未検知だった）。
--
-- 修正はsearch_pathを緩めるのではなく、digest()呼び出し側を`extensions.digest(...)`に
-- 完全修飾する。`extensions`はSupabaseが管理し一般ユーザーが書き込めないスキーマなので、
-- 検索パスに`public`を足す場合と違い、search_path経由の特権昇格リスクを増やさない。

begin;

create or replace function public.record_web_vital(
  p_page_template text,
  p_metric_name text,
  p_metric_value double precision,
  p_device_class text,
  p_client_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_bucket_key text;
  v_rate record;
begin
  v_bucket_key := encode(
    extensions.digest(coalesce(nullif(trim(p_client_ip), ''), 'unknown'), 'sha256'),
    'hex'
  );

  select allowed, retry_after_seconds
    into v_rate
    from private.try_consume_web_vital_rate_limit(v_bucket_key, 60, 60);

  if not v_rate.allowed then
    return jsonb_build_object('accepted', false, 'retry_after_seconds', v_rate.retry_after_seconds);
  end if;

  insert into private.web_vital_samples (page_template, metric_name, metric_value, device_class)
  values (p_page_template, p_metric_name, p_metric_value, p_device_class);

  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function private.try_consume_authenticated_rate_limit_once(
  p_operation text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  setting_name text := 'request.rate_limit_' || p_operation;
  prior_result text;
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  prior_result := current_setting(setting_name, true);
  if prior_result is not null and prior_result <> '' then
    return prior_result::integer;
  end if;

  retry_seconds := private.try_consume_rate_limit(p_operation, extensions.digest(current_user_id::text, 'sha256'));
  perform set_config(setting_name, retry_seconds::text, true);
  return retry_seconds;
end;
$$;

commit;

-- ロールバック（今回の変更を戻す場合）:
--
-- 033_web_vital_samples.sql と 035_authenticated_rate_limits.sql の
-- 該当関数定義（extensions.digest → digest に戻したもの）をcreate or replaceで再適用する。
