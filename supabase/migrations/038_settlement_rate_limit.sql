-- 清算（精算）の支払い記録・確認にレート制限と監査ログを追加する。
--
-- docs/codex-branch-triage.md「取り込みの順番（案）」6番目の残り（決済系）。
-- wip/legacy-helper-test の 023_rate_limits_and_security_audit.sql には
-- record_settlement_payment / record_public_settlement_payment /
-- confirm_settlement_payment / get_settlement_page_data という4本のRPCが
-- あるが、丸ごとの移植はしない。理由（ユーザーと合意済み）:
--
--   - 過払い防止は既に 021_settlement_payment_total_guard.sql の
--     before insert トリガー（enforce_settlement_payment_total）で対応済み。
--     023のRPCが持っていた「行ロックして残額確認」という保護は、
--     mainでは既に別の仕組みで達成されている。
--   - get_settlement_page_data が解決しようとしていたN+1問題も、
--     app/plans/[planId]/settlement/page.tsx が既に1回のネストしたselectで
--     全データを取得しており、移植の実利がほぼ無い。
--   - record_public_settlement_payment は auth.role() = 'service_role' を
--     前提にしているが、migration 030 で共有ページは「本人セッション＋RLS」に
--     移行済み。この前提はもう成立しない
--     （lib/actions/settlement/settlements.ts の recordPublicSettlementPaymentAction
--     のコメントに移行の経緯が書いてある）。
--
-- 支払い記録・確認・金額計算のロジックは一切変更しない。追加するのは
-- 「レート制限のゲート」と「成功時の監査ログ」の薄いRPC2本だけ。
-- lib/actions/settlement/settlements.ts 側の3アクション
-- （recordSettlementPaymentAction / recordPublicSettlementPaymentAction /
-- confirmSettlementPaymentAction）の冒頭でこれらを呼ぶ形にする。

begin;

-- rate_limit_for の対象に settlement_update を追加する（30回/分、
-- migration 035 の connection_update 等と同じ水準）。
create or replace function private.rate_limit_for(p_operation text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_operation
    when 'event_message_post' then 20
    when 'event_invitation_create' then 30
    when 'event_invitation_respond' then 30
    when 'connection_update' then 30
    when 'settlement_update' then 30
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- レート制限のゲート（汎用）。RPC内に業務ロジックを持たず、
-- TypeScript側の既存処理はそのままに、冒頭で呼ぶだけの薄い関数。
-- ---------------------------------------------------------------------------

create or replace function public.consume_authenticated_rate_limit(p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  retry_seconds integer;
begin
  retry_seconds := private.try_consume_authenticated_rate_limit_once(p_operation);
  if retry_seconds > 0 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.consume_authenticated_rate_limit(text) from public, anon;
grant execute on function public.consume_authenticated_rate_limit(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 監査ログの記録（認証済みユーザーから直接呼べる版）。
-- public.record_security_audit は service_role 必須で、認証済みユーザーが
-- 呼ぶ操作の内部からは使えない（migration 035のコメント参照）。actor_user_id は
-- 呼び出し元から渡させず auth.uid() から取るので、他人になりすませない。
-- ---------------------------------------------------------------------------

create or replace function public.record_authenticated_security_audit(
  p_operation text,
  p_target_type text,
  p_target_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_outcome not in ('success', 'denied') then
    raise exception using errcode = '22023', message = 'Unsupported audit outcome';
  end if;

  if p_operation not in ('settlement_payment_record', 'settlement_payment_confirm') then
    raise exception using errcode = '22023', message = 'Unsupported audit operation';
  end if;

  if p_target_type not in ('payment') then
    raise exception using errcode = '22023', message = 'Unsupported audit target';
  end if;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, p_operation, p_target_type, p_target_id, p_outcome);
end;
$$;

revoke all on function public.record_authenticated_security_audit(text, text, uuid, text) from public, anon;
grant execute on function public.record_authenticated_security_audit(text, text, uuid, text) to authenticated;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.record_authenticated_security_audit(text, text, uuid, text);
-- drop function if exists public.consume_authenticated_rate_limit(text);
-- migration 035 時点の rate_limit_for（settlement_update無し）へ戻すには、
-- そちらのCREATE OR REPLACE文を再適用する。
