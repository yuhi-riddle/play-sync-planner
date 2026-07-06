create unique index participants_plan_user_unique_idx
on public.participants(plan_id, user_id)
where user_id is not null;

create index participants_user_id_idx
on public.participants(user_id)
where user_id is not null;
