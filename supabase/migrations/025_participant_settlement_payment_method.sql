-- 清算の支払い方法を参加者単位で1箇所にまとめるためのカラム。
-- 清算計算上、1人の参加者は受け取る側(creditor)か払う側(debtor)の
-- どちらか一方にしかならないため、1カラムで受け取り方法・支払い方法の
-- 両方を兼ねる。詳細は docs/superpowers/specs/2026-08-02-settlement-payment-method-design.md を参照。
--
-- 注意: codex/performance-security-foundation ブランチ(未マージ)も025以降の
-- 番号を使う予定のため、マージ時にどちらかの番号を採番し直す調整が必要。

alter table public.participants
  add column if not exists settlement_payment_method text;

comment on column public.participants.settlement_payment_method is
  '清算での受け取り方法・支払い方法。参加者本人のみが設定する。';

-- 既存のsettlements.payment_methodを、受け取り側participantへバックフィルする。
-- 同一participantに複数の値がある場合は直近のpaid_at(無ければcreated_at)を優先する。
with ranked as (
  select
    to_participant_id,
    payment_method,
    row_number() over (
      partition by to_participant_id
      order by coalesce(paid_at, created_at) desc
    ) as rn
  from public.settlements
  where payment_method is not null
)
update public.participants
set settlement_payment_method = ranked.payment_method
from ranked
where participants.id = ranked.to_participant_id
  and ranked.rn = 1;
