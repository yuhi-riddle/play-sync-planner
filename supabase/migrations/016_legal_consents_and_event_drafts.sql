create table public.user_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  agreed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_consents_set_updated_at
before update on public.user_consents
for each row execute function public.set_updated_at();

create trigger event_drafts_set_updated_at
before update on public.event_drafts
for each row execute function public.set_updated_at();

alter table public.user_consents enable row level security;
alter table public.event_drafts enable row level security;

create policy "Users can manage their own consent"
on public.user_consents
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can manage their own event draft"
on public.event_drafts
for all
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());
