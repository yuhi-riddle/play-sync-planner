create table public.calendar_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null default 'primary',
  account_email text,
  encrypted_access_token text,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_integrations_provider_check check (provider in ('google')),
  constraint calendar_integrations_user_provider_unique unique (user_id, provider)
);

create index calendar_integrations_user_id_idx on public.calendar_integrations(user_id);

create trigger calendar_integrations_set_updated_at
before update on public.calendar_integrations
for each row execute function public.set_updated_at();

alter table public.calendar_integrations enable row level security;

create policy "Users can manage their calendar integration"
on public.calendar_integrations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
