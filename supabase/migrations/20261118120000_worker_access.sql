-- Phase 7 (slice 1): background worker access. Requires 20261118000000_application_queue.sql.
--
-- Workers use the secret-key client (role service_role), which has no auth.uid(). Functions
-- the worker shares with the app take an explicit user id that is honoured only for the
-- service role; signed-in users always act as themselves.

-- ---------------------------------------------------------------------------
-- ingest_jobs: same behaviour, plus p_user_id for scheduled discovery. The user id is honoured
-- only for the service role (security invoker, so current_user is the caller's role).
-- ---------------------------------------------------------------------------
drop function public.ingest_jobs(uuid, jsonb);

create function public.ingest_jobs(p_source_id uuid, p_jobs jsonb, p_user_id uuid default null)
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
  if v_user_id is not null then
    if p_user_id is not null and p_user_id <> v_user_id then
      raise exception 'cannot act for another user' using errcode = '42501';
    end if;
  elsif p_user_id is not null and current_user = 'service_role' then
    v_user_id := p_user_id;
  else
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

revoke execute on function public.ingest_jobs(uuid, jsonb, uuid) from public, anon;
grant execute on function public.ingest_jobs(uuid, jsonb, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- claim_next_application: now limited to p_candidates — the due applications whose job
-- site has a submission adapter. Everything else is unchanged (see the previous migration).
-- ---------------------------------------------------------------------------
drop function public.claim_next_application(uuid, timestamptz, timestamptz);

create function public.claim_next_application(
  p_user_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_candidates uuid[]
)
returns table (application_id uuid, lock_token uuid, run_id uuid, attempt integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_settings public.automation_settings%rowtype;
  v_used integer;
  v_application public.applications%rowtype;
  v_stale record;
  v_lock uuid := gen_random_uuid();
  v_run uuid;
begin
  if p_day_end <= p_day_start or p_day_end - p_day_start > interval '26 hours' then
    raise exception 'invalid day bounds' using errcode = '22023';
  end if;

  -- One claimer per user at a time, so the daily-limit count cannot race.
  perform pg_advisory_xact_lock(hashtextextended('jobpilot.claim:' || p_user_id::text, 0));

  -- A worker that stopped responding may have crashed after the final click, so a stale
  -- claim is never retried: it fails and waits for the user.
  for v_stale in
    select a.id, a.lock_token from public.applications a
    where a.user_id = p_user_id and a.status = 'applying' and a.locked_at < now() - interval '60 minutes'
  loop
    perform public.fail_application_attempt(v_stale.id, v_stale.lock_token, 'stale_claim',
      'The submission run stopped responding. Check the job site before retrying.', false);
  end loop;

  if coalesce(cardinality(p_candidates), 0) = 0 then
    return;
  end if;

  select * into v_settings from public.automation_settings s where s.user_id = p_user_id;
  if not found or not v_settings.is_enabled or v_settings.is_paused then
    return;
  end if;

  select count(*) into v_used
  from public.applications a
  where a.user_id = p_user_id
    and (a.status = 'applying' or (a.submitted_at >= p_day_start and a.submitted_at < p_day_end));
  if v_used >= v_settings.daily_application_limit then
    return;
  end if;

  select * into v_application
  from public.applications a
  where a.user_id = p_user_id
    and a.id = any (p_candidates)
    and a.status in ('approved', 'scheduled')
    and a.approved_at is not null
    and (a.scheduled_for is null or a.scheduled_for <= now())
    and not exists (
      select 1 from public.application_answers q where q.application_id = a.id and not q.is_verified
    )
  order by a.priority desc, a.created_at
  limit 1
  for update skip locked;
  if not found then
    return;
  end if;

  update public.applications
     set status = 'applying', lock_token = v_lock, locked_at = now(), scheduled_for = null
   where id = v_application.id;

  insert into public.automation_runs (user_id, kind, status, application_id, idempotency_key, attempt, started_at, log)
  values (p_user_id, 'submission', 'running', v_application.id,
          public.submission_run_key(v_application.idempotency_key, v_lock),
          v_application.attempt_count + 1, now(),
          jsonb_build_array(jsonb_build_object('at', now(), 'level', 'info', 'message', 'Claimed for submission')))
  returning id into v_run;

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, metadata)
  values (p_user_id, v_application.id, 'application.claimed', v_application.status, 'applying', 'automation',
          jsonb_build_object('run_id', v_run, 'attempt', v_application.attempt_count + 1));

  return query select v_application.id, v_lock, v_run, v_application.attempt_count + 1;
end;
$$;

revoke execute on function public.claim_next_application(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_next_application(uuid, timestamptz, timestamptz, uuid[]) to service_role;
