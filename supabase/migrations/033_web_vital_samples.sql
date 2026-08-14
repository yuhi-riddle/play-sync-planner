-- Web Vitals（LCP/INP/CLS）の保存を追加する。
--
-- app/api/performance/vitals/route.ts は現状 Zod で検証したあと console.info するだけで、
-- どこにも保存していない（同route内のコメントにも「保存は別途の作業として扱う」と明記）。
-- ここでは
--   1) private スキーマに実データを置き、PostgREST（public以外は露出しない）越しに
--      直接読み書きできないようにする
--   2) public スキーマの SECURITY DEFINER 関数だけを窓口にする
--   3) 匿名からのDoS/連打を軽く抑えるため、IPハッシュ単位の簡易レート制限を関数内で行う
-- という構成にする。
--
-- レート制限は private.web_vital_rate_limits という専用の軽量テーブルで持つ。
-- 023（wip/legacy-helper-test, private.rate_limit_buckets 等 2,085行）の汎用レート制限
-- 基盤とは切り離した別物。将来それを本線に導入する際に統合するかは別セッションの判断とする。
--
-- purge関数はここに含めるが、cronでの自動起動の配線（vercel.json / app/api/cron/配下）は
-- 今回のスコープ外。手動で `select public.purge_expired_web_vitals();` を叩くか、
-- 別途cronを配線するまでは private.web_vital_samples / private.web_vital_rate_limits は
-- 増え続ける点に注意（docs/codex-branch-triage.md 参照）。

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- 実データ
-- ---------------------------------------------------------------------------

create table private.web_vital_samples (
  id uuid primary key default gen_random_uuid(),
  page_template text not null,
  metric_name text not null,
  metric_value double precision not null,
  device_class text not null,
  created_at timestamptz not null default now(),
  constraint web_vital_samples_page_template_check check (
    page_template in (
      'home', 'events', 'event-new', 'event-detail', 'event-edit',
      'plan-new', 'plans', 'plan-detail', 'plan-edit', 'plan-confirm',
      'settlement', 'notifications', 'connections', 'settings', 'settings-withdraw',
      'login', 'consent', 'onboarding', 'invite',
      'share-answer', 'share-answer-complete', 'share-settlement', 'legal', 'other'
    )
  ),
  constraint web_vital_samples_metric_name_check check (metric_name in ('LCP', 'INP', 'CLS')),
  constraint web_vital_samples_metric_value_check check (
    (metric_name = 'CLS' and metric_value >= 0 and metric_value <= 10)
    or (metric_name in ('LCP', 'INP') and metric_value >= 0 and metric_value <= 120000)
  ),
  constraint web_vital_samples_device_class_check check (device_class in ('mobile', 'desktop'))
);

-- page_template の一覧は lib/domain/shared/web-vitals.ts の pageTemplates と一致させること。
-- 片方だけを更新すると、Zodは通るのにDBのCHECK制約で静かに弾かれる状態になる。

-- purge（30日超過分の削除）で created_at のみで絞り込むためのインデックス。
-- ダッシュボード用の集計クエリは今回作らないので、page_template/metric_name 側の
-- 複合インデックスは今は追加しない（必要になったら別マイグレーションで足す）。
create index web_vital_samples_created_at_idx on private.web_vital_samples (created_at);

alter table private.web_vital_samples enable row level security;
-- ポリシーは意図的に追加しない = private スキーマ経由の直接アクセスは（PostgRESTには
-- 露出しないが、念のため）誰にも許可しない。読み書きは全て SECURITY DEFINER 関数経由。

-- ---------------------------------------------------------------------------
-- レート制限バケット（IPハッシュ単位の固定ウィンドウカウンタ）
-- ---------------------------------------------------------------------------

create table private.web_vital_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hit_count integer not null default 0
);

-- purge で古いバケットを掃除するためのインデックス（ウィンドウは60秒なので、
-- 数分〜数時間経過した行はもう判定に使われないゴミ）。
create index web_vital_rate_limits_window_start_idx on private.web_vital_rate_limits (window_start);

alter table private.web_vital_rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- レート制限の判定・消費（内部ヘルパー）
--
-- 固定ウィンドウ方式。1本のUPSERT文で読み取り→更新をアトミックに行い、
-- 同時アクセスでもレースなく1カウントずつ積める（select→updateの2段階にしない）。
-- ---------------------------------------------------------------------------

create or replace function private.try_consume_web_vital_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_limit integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = private
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_hit_count integer;
begin
  insert into private.web_vital_rate_limits as t (bucket_key, window_start, hit_count)
  values (p_bucket_key, v_now, 1)
  on conflict (bucket_key) do update
    set
      window_start = case
        when t.window_start <= v_now - make_interval(secs => p_window_seconds) then v_now
        else t.window_start
      end,
      hit_count = case
        when t.window_start <= v_now - make_interval(secs => p_window_seconds) then 1
        else t.hit_count + 1
      end
  returning t.window_start, t.hit_count into v_window_start, v_hit_count;

  if v_hit_count > p_limit then
    return query
      select
        false,
        greatest(
          1,
          ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer
        );
  else
    return query select true, 0;
  end if;
end;
$$;

revoke all on function private.try_consume_web_vital_rate_limit(text, integer, integer) from public;

-- ---------------------------------------------------------------------------
-- 記録用エントリポイント（public、service_role専用）
--
-- IPそのものはここでのみ扱い、ハッシュ化してからバケットキーにする。秘密のsaltは
-- 使わない（認可情報ではなく、あくまで悪用抑止用の粗いキーであるため）。
-- レート制限の閾値: 60秒に60回まで。5%サンプリング・1ページで最大3メトリクス
-- （LCP/INP/CLS）という送信頻度と、オフィスやモバイル回線でIPを共有する
-- ケースを踏まえて緩めに設定。実運用のログを見て必要なら閾値だけ変える
-- 別マイグレーションを切る。
-- ---------------------------------------------------------------------------

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
    digest(coalesce(nullif(trim(p_client_ip), ''), 'unknown'), 'sha256'),
    'hex'
  );

  select allowed, retry_after_seconds
    into v_rate
    from private.try_consume_web_vital_rate_limit(v_bucket_key, 60, 60);

  if not v_rate.allowed then
    return jsonb_build_object('accepted', false, 'retry_after_seconds', v_rate.retry_after_seconds);
  end if;

  -- page_template / metric_name / metric_value / device_class の妥当性は
  -- テーブルの check 制約に任せる（呼び出し元のZodと二重に持たない）。
  -- 呼び出し元は必ずAPI route経由でZod検証済みのため、制約違反は実運用上は
  -- 起こらない想定（起きた場合はここで例外になり、レート制限のカウントだけ消費される）。
  insert into private.web_vital_samples (page_template, metric_name, metric_value, device_class)
  values (p_page_template, p_metric_name, p_metric_value, p_device_class);

  return jsonb_build_object('accepted', true);
end;
$$;

revoke all on function public.record_web_vital(text, text, double precision, text, text)
  from public, anon, authenticated;
grant execute on function public.record_web_vital(text, text, double precision, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 保持期間の掃除（cronでの自動配線は今回のスコープ外。手動 or 将来のcronから呼ぶ）
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_web_vitals()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_deleted integer;
begin
  delete from private.web_vital_samples
  where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;

  -- レート制限バケットは60秒ウィンドウなので、1日も経てば判定には使われないゴミ。
  delete from private.web_vital_rate_limits
  where window_start < now() - interval '1 day';

  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_web_vitals() from public, anon, authenticated;
grant execute on function public.purge_expired_web_vitals() to service_role;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.purge_expired_web_vitals();
-- drop function if exists public.record_web_vital(text, text, double precision, text, text);
-- drop function if exists private.try_consume_web_vital_rate_limit(text, integer, integer);
-- drop table if exists private.web_vital_rate_limits;
-- drop table if exists private.web_vital_samples;
-- drop schema if exists private;
