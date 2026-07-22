begin;

create table private.web_vital_samples (
  id bigint generated always as identity primary key,
  page_template text not null check (
    page_template in ('home', 'events', 'event-detail', 'calendar', 'connections', 'other')
  ),
  metric_name text not null check (metric_name in ('LCP', 'INP', 'CLS')),
  metric_value double precision not null check (
    metric_value >= 0
    and metric_value <> 'NaN'::double precision
    and metric_value <> 'Infinity'::double precision
    and metric_value <> '-Infinity'::double precision
    and (
      (metric_name = 'CLS' and metric_value <= 10)
      or (metric_name in ('LCP', 'INP') and metric_value <= 120000)
    )
  ),
  device_class text not null check (device_class in ('mobile', 'desktop')),
  created_at timestamptz not null default now()
);

create index web_vital_samples_created_at_idx
on private.web_vital_samples(created_at);

revoke all on table private.web_vital_samples from public;
revoke all on table private.web_vital_samples from anon;
revoke all on table private.web_vital_samples from authenticated;
revoke all on table private.web_vital_samples from service_role;
revoke all on sequence private.web_vital_samples_id_seq from public;
revoke all on sequence private.web_vital_samples_id_seq from anon;
revoke all on sequence private.web_vital_samples_id_seq from authenticated;
revoke all on sequence private.web_vital_samples_id_seq from service_role;

create or replace function private.rate_limit_for(p_operation text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_operation
    when 'event_message_post' then 20
    when 'google_availability' then 6
    when 'connection_update' then 30
    when 'event_invitation_create' then 30
    when 'event_invitation_respond' then 30
    when 'event_update' then 30
    when 'plan_update' then 30
    when 'event_member_update' then 30
    when 'profile_update' then 30
    when 'settlement_update' then 30
    when 'google_calendar_update' then 30
    when 'public_answer' then 10
    when 'public_payment' then 10
    when 'web_vital' then 30
    else null
  end;
$$;

create or replace function public.record_web_vital(
  page_template text,
  metric_name text,
  metric_value double precision,
  device_class text,
  subject_hash bytea
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  retry_seconds integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Service role required';
  end if;

  retry_seconds := private.try_consume_rate_limit('web_vital', subject_hash);
  if retry_seconds > 0 then
    return retry_seconds;
  end if;

  insert into private.web_vital_samples (
    page_template,
    metric_name,
    metric_value,
    device_class
  )
  values (
    record_web_vital.page_template,
    record_web_vital.metric_name,
    record_web_vital.metric_value,
    record_web_vital.device_class
  );

  return 0;
end;
$$;

create or replace function public.purge_expired_web_vitals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Service role required';
  end if;

  delete from private.web_vital_samples
  where created_at < clock_timestamp() - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.record_web_vital(text, text, double precision, text, bytea) from public;
revoke all on function public.record_web_vital(text, text, double precision, text, bytea) from anon;
revoke all on function public.record_web_vital(text, text, double precision, text, bytea) from authenticated;
grant execute on function public.record_web_vital(text, text, double precision, text, bytea) to service_role;

revoke all on function public.purge_expired_web_vitals() from public;
revoke all on function public.purge_expired_web_vitals() from anon;
revoke all on function public.purge_expired_web_vitals() from authenticated;
grant execute on function public.purge_expired_web_vitals() to service_role;

commit;
