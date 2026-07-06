alter table public.plan_reminder_settings
add column if not exists reminder_offsets_minutes integer[] not null default '{}'::integer[];

update public.plan_reminder_settings
set reminder_offsets_minutes = array[reminder_offset_minutes]
where reminder_offset_minutes is not null
  and cardinality(reminder_offsets_minutes) = 0;

alter table public.plan_reminder_settings
drop constraint if exists plan_reminder_settings_offsets_check;

alter table public.plan_reminder_settings
add constraint plan_reminder_settings_offsets_check check (
  reminder_offsets_minutes is not null
  and array_position(reminder_offsets_minutes, null) is null
  and 0 <= all (reminder_offsets_minutes)
);
