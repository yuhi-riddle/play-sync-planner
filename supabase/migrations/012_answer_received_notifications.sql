alter table public.notifications
drop constraint if exists notifications_kind_check;

alter table public.notifications
add constraint notifications_kind_check check (
  kind in (
    'answer_deadline',
    'unanswered',
    'answer_received',
    'settlement_needed',
    'payment_due',
    'confirmation_due'
  )
);
