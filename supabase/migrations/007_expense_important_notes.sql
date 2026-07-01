alter table public.expenses
add column is_important boolean not null default false;
