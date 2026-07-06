create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text not null,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_kind_check check (
    kind in ('answer_deadline', 'unanswered', 'answer_received', 'settlement_needed', 'payment_due', 'confirmation_due')
  ),
  constraint notifications_dedupe_unique unique (user_id, dedupe_key)
);

create index notifications_user_id_read_at_created_at_idx
on public.notifications(user_id, read_at, created_at desc);

create trigger notifications_set_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;

create policy "Users can manage own notifications"
on public.notifications
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
