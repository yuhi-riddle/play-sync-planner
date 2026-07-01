alter table public.settlement_reminder_logs
add column if not exists reminder_type text not null default 'other';

alter table public.settlement_reminder_logs
drop constraint if exists settlement_reminder_logs_reminder_type_check;

alter table public.settlement_reminder_logs
add constraint settlement_reminder_logs_reminder_type_check
check (reminder_type in ('payment_request', 'confirmation_request', 'other'));

create index if not exists settlement_reminder_logs_reminder_type_idx
on public.settlement_reminder_logs(reminder_type);
