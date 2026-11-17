-- Job discovery: URL uniqueness, a listing view, atomic ingestion and archive/restore.

-- The same canonical posting URL is one job, whatever source found it.
create unique index jobs_user_url_idx on public.jobs (user_id, url);

-- ---------------------------------------------------------------------------
-- job_listings: jobs + pipeline status + source, for list views and counts.
-- security_invoker makes the caller's RLS apply to every underlying table.
-- ---------------------------------------------------------------------------
create view public.job_listings
with (security_invoker = true)
as
select
  j.id,
  j.user_id,
  j.source_id,
  s.connector_key as source_key,
  s.name as source_name,
  j.url,
  j.title,
  j.company,
  j.location,
  j.remote_type,
  j.employment_type,
  j.salary_min,
  j.salary_max,
  j.salary_currency,
  j.salary_period,
  -- Highest known salary figure, for "at least X" filters.
  coalesce(j.salary_max, j.salary_min) as salary_upper,
  j.posted_at,
  j.discovered_at,
  a.id as application_id,
  a.status
from public.jobs j
join public.applications a on a.job_id = j.id and a.user_id = j.user_id
left join public.job_sources s on s.id = j.source_id;

revoke all on public.job_listings from anon;
grant select on public.job_listings to authenticated;

-- ---------------------------------------------------------------------------
-- ingest_jobs: inserts normalized jobs and their pipeline rows in one transaction.
-- Duplicates (dedupe hash, canonical URL, or source external id) are skipped.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_jobs(p_source_id uuid, p_jobs jsonb)
returns table (inserted_count integer, skipped_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_total integer;
  v_inserted integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_jobs) is distinct from 'array' then
    raise exception 'p_jobs must be a JSON array' using errcode = '22023';
  end if;
  if p_source_id is not null and not exists (
    select 1 from public.job_sources where id = p_source_id and user_id = v_user_id
  ) then
    raise exception 'job source not found' using errcode = 'P0002';
  end if;

  v_total := jsonb_array_length(p_jobs);

  with incoming as (
    select *
    from jsonb_to_recordset(p_jobs) as j (
      external_id text,
      url text,
      dedupe_hash text,
      title text,
      company text,
      location text,
      remote_type public.remote_type,
      employment_type public.employment_type,
      salary_min numeric,
      salary_max numeric,
      salary_currency text,
      salary_period public.salary_period,
      description text,
      posted_at timestamptz
    )
  ),
  new_jobs as (
    insert into public.jobs (
      user_id, source_id, external_id, url, dedupe_hash, title, company, location,
      remote_type, employment_type, salary_min, salary_max, salary_currency, salary_period,
      description, posted_at
    )
    select
      v_user_id, p_source_id, i.external_id, i.url, i.dedupe_hash, i.title, i.company, i.location,
      coalesce(i.remote_type, 'unknown'), i.employment_type, i.salary_min, i.salary_max,
      i.salary_currency, i.salary_period, i.description, i.posted_at
    from incoming i
    on conflict do nothing
    returning id
  ),
  new_applications as (
    insert into public.applications (user_id, job_id)
    select v_user_id, id from new_jobs
    returning id
  )
  select count(*)::integer into v_inserted from new_applications;

  inserted_count := v_inserted;
  skipped_count := v_total - v_inserted;
  return next;
end;
$$;

revoke execute on function public.ingest_jobs(uuid, jsonb) from public, anon;
grant execute on function public.ingest_jobs(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- set_job_archived: archive (before approval only) or restore, with an audit event.
-- ---------------------------------------------------------------------------
create or replace function public.set_job_archived(p_job_id uuid, p_archived boolean)
returns public.application_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_next public.application_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_application
  from public.applications
  where job_id = p_job_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if p_archived then
    if v_application.status = 'archived' then
      return v_application.status;
    end if;
    if v_application.status not in ('discovered', 'analyzing', 'qualified', 'drafting', 'pending_approval') then
      raise exception 'cannot archive an application with status %', v_application.status
        using errcode = '22023';
    end if;
    v_next := 'archived';
  else
    if v_application.status <> 'archived' then
      return v_application.status;
    end if;
    v_next := 'discovered';
  end if;

  update public.applications set status = v_next where id = v_application.id;

  insert into public.application_events
    (user_id, application_id, event_type, from_status, to_status, actor)
  values
    (v_user_id, v_application.id,
     case when p_archived then 'job.archived' else 'job.restored' end,
     v_application.status, v_next, 'user');

  return v_next;
end;
$$;

revoke execute on function public.set_job_archived(uuid, boolean) from public, anon;
grant execute on function public.set_job_archived(uuid, boolean) to authenticated;
