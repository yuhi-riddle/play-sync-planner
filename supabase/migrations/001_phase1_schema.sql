create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'nazotoki',
  title text not null,
  url text,
  location_name text,
  address text,
  start_date date,
  end_date date,
  price integer,
  capacity integer,
  status text not null default 'interested',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_category_check check (
    category in ('nazotoki', 'live', 'travel', 'drinking', 'snowboard', 'boardgame', 'movie_stage', 'other')
  ),
  constraint events_status_check check (
    status in ('interested', 'planning', 'confirmed', 'done', 'cancelled', 'skipped')
  ),
  constraint events_price_check check (price is null or price >= 0),
  constraint events_capacity_check check (capacity is null or capacity >= 0),
  constraint events_date_range_check check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'draft',
  confirmed_start_at timestamptz,
  confirmed_end_at timestamptz,
  is_all_day boolean not null default false,
  answer_deadline_at timestamptz,
  settlement_status text not null default 'not_started',
  ticket_status text not null default 'not_purchased',
  google_calendar_event_id text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_status_check check (
    status in ('draft', 'collecting_answers', 'date_confirmed', 'ticket_purchased', 'settling', 'settled', 'participated', 'cancelled', 'skipped')
  ),
  constraint plans_settlement_status_check check (
    settlement_status in ('not_started', 'not_needed', 'needed', 'settling', 'settled')
  ),
  constraint plans_ticket_status_check check (
    ticket_status in ('not_purchased', 'purchasing', 'purchased', 'not_needed')
  ),
  constraint plans_confirmed_range_check check (
    confirmed_end_at is null or confirmed_start_at is null or confirmed_end_at >= confirmed_start_at
  )
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  participant_type text not null default 'guest',
  status text not null default 'invited',
  is_organizer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_type_check check (participant_type in ('registered', 'guest')),
  constraint participants_status_check check (
    status in ('invited', 'answered', 'confirmed', 'waitlisted', 'declined', 'cancelled')
  )
);

create table public.candidate_dates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean not null default false,
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_dates_range_check check (end_at is null or end_at >= start_at)
);

create table public.availability_answers (
  id uuid primary key default gen_random_uuid(),
  candidate_date_id uuid not null references public.candidate_dates(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  answer text not null default 'unanswered',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_answers_answer_check check (answer in ('yes', 'maybe', 'no', 'unanswered')),
  constraint availability_answers_unique unique (candidate_date_id, participant_id)
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  token text not null unique,
  purpose text not null default 'answer',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint share_links_purpose_check check (purpose in ('answer', 'summary', 'settlement', 'payment_request'))
);

create index events_owner_user_id_idx on public.events(owner_user_id);
create index plans_event_id_idx on public.plans(event_id);
create index plans_owner_user_id_idx on public.plans(owner_user_id);
create index participants_plan_id_idx on public.participants(plan_id);
create index candidate_dates_plan_id_idx on public.candidate_dates(plan_id);
create index availability_answers_participant_id_idx on public.availability_answers(participant_id);
create index share_links_plan_id_idx on public.share_links(plan_id);
create index share_links_token_idx on public.share_links(token);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

create trigger candidate_dates_set_updated_at
before update on public.candidate_dates
for each row execute function public.set_updated_at();

create trigger availability_answers_set_updated_at
before update on public.availability_answers
for each row execute function public.set_updated_at();

create trigger share_links_set_updated_at
before update on public.share_links
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.plans enable row level security;
alter table public.participants enable row level security;
alter table public.candidate_dates enable row level security;
alter table public.availability_answers enable row level security;
alter table public.share_links enable row level security;

create policy "Owners can manage their events"
on public.events
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "Owners can manage their plans"
on public.plans
for all
to authenticated
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.events
    where events.id = plans.event_id
      and events.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage participants"
on public.participants
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = participants.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = participants.plan_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage candidate dates"
on public.candidate_dates
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = candidate_dates.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = candidate_dates.plan_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage availability answers"
on public.availability_answers
for all
to authenticated
using (
  exists (
    select 1
    from public.candidate_dates
    join public.plans on plans.id = candidate_dates.plan_id
    where candidate_dates.id = availability_answers.candidate_date_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.candidate_dates
    join public.plans on plans.id = candidate_dates.plan_id
    where candidate_dates.id = availability_answers.candidate_date_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage share links"
on public.share_links
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = share_links.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = share_links.plan_id
      and plans.owner_user_id = auth.uid()
  )
);
