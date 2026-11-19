-- Phase 6: application state machine, approval, submission queue and the claim/retry contract
-- for submission workers (Phase 7). Requires 20261117210000_application_studio.sql.
--
-- Window rules stay in the app (src/lib/scheduling/submission-window.ts): callers pass the
-- computed "submit after" instant and local day bounds; SQL never re-implements working hours.

-- ---------------------------------------------------------------------------
-- 1. One state machine for every writer (user functions, service role, workers).
-- ---------------------------------------------------------------------------
create or replace function public.application_transition_allowed(
  p_from public.application_status,
  p_to public.application_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from::text || '>' || p_to::text) = any (array[
    -- discovery, evaluation and preparation
    'discovered>analyzing', 'discovered>qualified', 'discovered>archived', 'discovered>drafting',
    'discovered>pending_approval',
    'analyzing>discovered', 'analyzing>qualified', 'analyzing>archived',
    'qualified>discovered', 'qualified>analyzing', 'qualified>archived', 'qualified>drafting',
    'qualified>pending_approval',
    'archived>discovered',
    'drafting>archived', 'drafting>pending_approval',
    -- the user applied outside JobPilot (manual submission)
    'discovered>applied', 'qualified>applied', 'drafting>applied',
    -- approval
    'pending_approval>archived', 'pending_approval>approved', 'pending_approval>scheduled',
    'pending_approval>applied',
    -- queue
    'approved>pending_approval', 'approved>scheduled', 'approved>applying', 'approved>applied',
    'approved>withdrawn',
    'scheduled>pending_approval', 'scheduled>approved', 'scheduled>applying', 'scheduled>applied',
    'scheduled>withdrawn',
    -- submission (claimed by a worker)
    'applying>approved', 'applying>scheduled', 'applying>failed', 'applying>applied',
    'failed>pending_approval', 'failed>approved', 'failed>scheduled', 'failed>applied', 'failed>withdrawn',
    -- tracking (Phase 8 adds the user actions)
    'applied>interview', 'applied>assessment', 'applied>rejected', 'applied>withdrawn',
    'interview>assessment', 'interview>rejected', 'interview>withdrawn',
    'assessment>interview', 'assessment>rejected', 'assessment>withdrawn'
  ]);
$$;

create or replace function public.guard_application_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.application_transition_allowed(old.status, new.status) then
    raise exception 'cannot change an application from % to %', old.status, new.status using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Not limited to "update of status": it must also see status changes made by earlier
-- BEFORE triggers (they fire alphabetically, so this one runs after "approval_*").
create trigger guard_status_transition
  before update on public.applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.guard_application_transition();

revoke execute on function public.guard_application_transition() from public, anon, authenticated;

-- A claim (lock) exists exactly while a worker is submitting, and nothing is queued or
-- submitted by a worker without a recorded approval. No worker has run before this
-- migration, so only approvals set by hand can lack a timestamp; backfill those first.
update public.applications
   set approved_at = updated_at
 where status in ('approved', 'scheduled', 'applying') and approved_at is null;

alter table public.applications
  add constraint applications_claim_matches_status check ((status = 'applying') = (lock_token is not null)),
  add constraint applications_approval_recorded check (
    status not in ('approved', 'scheduled', 'applying') or approved_at is not null
  );

-- ---------------------------------------------------------------------------
-- 2. Status and submission bookkeeping change only through the functions below.
-- Functions that move statuses run as definer; each checks auth.uid() and filters by user_id.
-- ---------------------------------------------------------------------------
revoke insert (status) on public.applications from authenticated;
revoke update (status, approved_at, scheduled_for, submitted_at, submission_method)
  on public.applications from authenticated;

alter function public.record_job_evaluation(uuid, jsonb, jsonb, public.application_status) security definer;
alter function public.set_job_archived(uuid, boolean) security definer;
alter function public.mark_application_ready(uuid, boolean) security definer;
alter function public.save_application_document(uuid, public.document_kind, text, text, public.answer_source, text, uuid, text[]) security definer;

-- ---------------------------------------------------------------------------
-- 3. Approval covers what the user saw. Changing a document, a screening answer or the
-- resume afterwards withdraws the approval; while a worker is submitting, they are locked.
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_stale_approval(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
begin
  select * into v_application from public.applications where id = p_application_id for update;
  if not found then
    return; -- the application itself is being deleted
  end if;
  if v_application.status = 'applying' then
    raise exception 'this application is being submitted; its documents are locked' using errcode = '22023';
  end if;
  if v_application.status in ('approved', 'scheduled', 'failed') then
    update public.applications
       set status = 'pending_approval', approved_at = null, scheduled_for = null
     where id = p_application_id;
    insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, message)
    values (v_application.user_id, p_application_id, 'application.approval_withdrawn', v_application.status,
            'pending_approval', 'user', p_reason);
  end if;
end;
$$;

create or replace function public.approval_content_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.withdraw_stale_approval(
    coalesce(new.application_id, old.application_id),
    case tg_table_name
      when 'application_documents' then 'A document changed after approval.'
      else 'A screening answer changed after approval.'
    end
  );
  return null;
end;
$$;

create trigger approval_content_changed
  after insert or update or delete on public.application_documents
  for each row execute function public.approval_content_changed();
create trigger approval_content_changed
  after insert or update or delete on public.application_answers
  for each row execute function public.approval_content_changed();

create or replace function public.approval_resume_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'applying' then
    raise exception 'this application is being submitted; its resume is locked' using errcode = '22023';
  end if;
  if old.status in ('approved', 'scheduled', 'failed') then
    new.status := 'pending_approval';
    new.approved_at := null;
    new.scheduled_for := null;
    insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, message)
    values (old.user_id, old.id, 'application.approval_withdrawn', old.status, 'pending_approval', 'user',
            'The resume changed after approval.');
  end if;
  return new;
end;
$$;

-- Approval itself pins the resume (see approve_application), so only changes made while
-- the status stays the same count.
create trigger approval_resume_changed
  before update of resume_id on public.applications
  for each row
  when (old.resume_id is distinct from new.resume_id and old.status = new.status)
  execute function public.approval_resume_changed();

revoke execute on function public.withdraw_stale_approval(uuid, text) from public, anon, authenticated;
revoke execute on function public.approval_content_changed() from public, anon, authenticated;
revoke execute on function public.approval_resume_changed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. User actions.
-- ---------------------------------------------------------------------------

-- approve_application: pending_approval | failed → approved (may be submitted now) or
-- scheduled (p_submit_after in the future, computed by the app from the submission window).
-- Pins the resume (the chosen one, else the default) so later changes withdraw the approval.
create or replace function public.approve_application(p_application_id uuid, p_submit_after timestamptz)
returns public.application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_resume_id uuid;
  v_next public.application_status;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_application.status in ('approved', 'scheduled') then
    return v_application.status;
  end if;
  if v_application.status not in ('pending_approval', 'failed') then
    raise exception 'only applications waiting for approval can be approved (this one is %)', v_application.status
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.application_documents
    where application_id = p_application_id and kind in ('cover_letter', 'application_email')
  ) then
    raise exception 'add a cover letter or application email first' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.application_answers
    where application_id = p_application_id and not is_verified
  ) then
    raise exception 'verify every screening answer before approving' using errcode = '22023';
  end if;

  v_resume_id := coalesce(
    v_application.resume_id,
    (select id from public.resumes where user_id = v_user_id and is_default limit 1)
  );
  if v_resume_id is null then
    raise exception 'choose a resume or set a default resume first' using errcode = '22023';
  end if;

  v_next := case when p_submit_after is not null and p_submit_after > now() then 'scheduled' else 'approved' end;

  update public.applications
     set status = v_next,
         resume_id = v_resume_id,
         approved_at = now(),
         scheduled_for = case when v_next = 'scheduled' then p_submit_after end,
         attempt_count = 0,
         last_error = null
   where id = p_application_id;

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, metadata)
  values (v_user_id, p_application_id, 'application.approved', v_application.status, v_next, 'user',
          jsonb_build_object('submit_after', p_submit_after, 'resume_id', v_resume_id));

  return v_next;
end;
$$;

-- withdraw_approval: approved | scheduled | failed → pending_approval.
create or replace function public.withdraw_approval(p_application_id uuid)
returns public.application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_application.status = 'pending_approval' then
    return v_application.status;
  end if;
  if v_application.status not in ('approved', 'scheduled', 'failed') then
    raise exception 'cannot withdraw approval from an application that is %', v_application.status
      using errcode = '22023';
  end if;

  update public.applications
     set status = 'pending_approval', approved_at = null, scheduled_for = null
   where id = p_application_id;

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor)
  values (v_user_id, p_application_id, 'application.approval_withdrawn', v_application.status, 'pending_approval', 'user');

  return 'pending_approval';
end;
$$;

-- mark_application_submitted: the user applied themselves (manual submission), from JobPilot
-- or elsewhere. Counts toward the daily limit like any submission.
create or replace function public.mark_application_submitted(p_application_id uuid)
returns public.application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_application public.applications%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if v_application.status = 'applied' then
    return v_application.status;
  end if;
  if v_application.status not in ('discovered', 'qualified', 'drafting', 'pending_approval', 'approved', 'scheduled', 'failed') then
    raise exception 'cannot mark an application that is % as applied', v_application.status using errcode = '22023';
  end if;

  update public.applications
     set status = 'applied', submission_method = 'manual', submitted_at = now(), scheduled_for = null
   where id = p_application_id;

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, metadata)
  values (v_user_id, p_application_id, 'application.submitted', v_application.status, 'applied', 'user',
          jsonb_build_object('method', 'manual'));

  return 'applied';
end;
$$;

revoke execute on function public.approve_application(uuid, timestamptz) from public, anon;
grant execute on function public.approve_application(uuid, timestamptz) to authenticated;
revoke execute on function public.withdraw_approval(uuid) from public, anon;
grant execute on function public.withdraw_approval(uuid) to authenticated;
revoke execute on function public.mark_application_submitted(uuid) from public, anon;
grant execute on function public.mark_application_submitted(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Submission worker contract (service role only; used by the Phase 7 worker).
--
-- claim → (automation) → re-check window + pause in the app immediately before the final
-- click → complete (verified) | release (stopped before the final click, no error)
--       | fail (error). Pass p_retryable = true ONLY when the run stopped before the final
-- click; after it, a retry could submit twice, so the application must fail for review.
-- ---------------------------------------------------------------------------

create or replace function public.submission_run_key(p_application_idempotency_key uuid, p_lock_token uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'submit:' || p_application_idempotency_key::text || ':' || p_lock_token::text;
$$;

-- fail_application_attempt: counts a failed attempt. Retryable failures go back to the queue
-- after retry_backoff_minutes while attempts <= max_retries; otherwise the application fails
-- and the run needs attention.
create or replace function public.fail_application_attempt(
  p_application_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns public.application_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
  v_settings public.automation_settings%rowtype;
  v_attempts integer;
  v_next public.application_status;
  v_retry_at timestamptz;
begin
  select * into v_application
  from public.applications
  where id = p_application_id and status = 'applying' and lock_token = p_lock_token
  for update;
  if not found then
    raise exception 'claim not found or already finished' using errcode = 'P0002';
  end if;
  select * into v_settings from public.automation_settings where user_id = v_application.user_id;

  v_attempts := v_application.attempt_count + 1;
  if coalesce(p_retryable, false) and v_attempts <= coalesce(v_settings.max_retries, 0) then
    v_next := 'scheduled';
    v_retry_at := now() + make_interval(mins => v_settings.retry_backoff_minutes);
  else
    v_next := 'failed';
  end if;

  update public.applications
     set status = v_next,
         scheduled_for = v_retry_at,
         attempt_count = least(v_attempts, 32767),
         last_error = left(coalesce(p_error_code, 'error') || ': ' || coalesce(p_error_message, ''), 1000),
         lock_token = null,
         locked_at = null
   where id = p_application_id;

  update public.automation_runs
     set status = case when v_next = 'failed' then 'needs_attention' else 'failed' end::public.run_status,
         error_code = p_error_code,
         error_message = left(p_error_message, 1000),
         finished_at = now()
   where user_id = v_application.user_id
     and idempotency_key = public.submission_run_key(v_application.idempotency_key, p_lock_token);

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, message, metadata)
  values (v_application.user_id, p_application_id, 'application.attempt_failed', 'applying', v_next, 'automation',
          left(p_error_message, 1000),
          jsonb_build_object('error_code', p_error_code, 'attempt', v_attempts, 'retry_at', v_retry_at));

  return v_next;
end;
$$;

-- claim_next_application: atomically picks the next eligible application for one user and
-- locks it. Returns no row when automation is off or paused, the daily limit is used up, or
-- nothing is due. The daily limit counts every submission of the local day (manual and
-- automated) plus claims in flight. p_day_start/p_day_end come from localDayBounds.
create or replace function public.claim_next_application(
  p_user_id uuid,
  p_day_start timestamptz,
  p_day_end timestamptz
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

-- release_application_claim: the worker stopped before the final click without an error
-- (window closed, emergency pause). Not counted as an attempt.
create or replace function public.release_application_claim(
  p_application_id uuid,
  p_lock_token uuid,
  p_submit_after timestamptz,
  p_reason text
)
returns public.application_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
  v_next public.application_status;
begin
  select * into v_application
  from public.applications
  where id = p_application_id and status = 'applying' and lock_token = p_lock_token
  for update;
  if not found then
    raise exception 'claim not found or already finished' using errcode = 'P0002';
  end if;

  v_next := case when p_submit_after is not null and p_submit_after > now() then 'scheduled' else 'approved' end;

  update public.applications
     set status = v_next,
         scheduled_for = case when v_next = 'scheduled' then p_submit_after end,
         lock_token = null,
         locked_at = null
   where id = p_application_id;

  update public.automation_runs
     set status = 'cancelled',
         finished_at = now(),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'level', 'info', 'message', left(p_reason, 500)))
   where user_id = v_application.user_id
     and idempotency_key = public.submission_run_key(v_application.idempotency_key, p_lock_token);

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, message)
  values (v_application.user_id, p_application_id, 'application.claim_released', 'applying', v_next, 'automation',
          left(p_reason, 500));

  return v_next;
end;
$$;

-- complete_application_submission: the worker verified the confirmation (page text, URL or
-- email). Evidence is required; it is kept in the run log.
create or replace function public.complete_application_submission(
  p_application_id uuid,
  p_lock_token uuid,
  p_evidence jsonb
)
returns public.application_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application public.applications%rowtype;
begin
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or p_evidence = '{}'::jsonb then
    raise exception 'verification evidence is required' using errcode = '22023';
  end if;

  select * into v_application
  from public.applications
  where id = p_application_id and status = 'applying' and lock_token = p_lock_token
  for update;
  if not found then
    raise exception 'claim not found or already finished' using errcode = 'P0002';
  end if;

  update public.applications
     set status = 'applied',
         submission_method = 'automation',
         submitted_at = now(),
         submission_verified_at = now(),
         last_error = null,
         lock_token = null,
         locked_at = null
   where id = p_application_id;

  update public.automation_runs
     set status = 'succeeded',
         finished_at = now(),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'level', 'info',
                                                           'message', 'Submission verified', 'data', p_evidence))
   where user_id = v_application.user_id
     and idempotency_key = public.submission_run_key(v_application.idempotency_key, p_lock_token);

  insert into public.application_events (user_id, application_id, event_type, from_status, to_status, actor, metadata)
  values (v_application.user_id, p_application_id, 'application.submitted', 'applying', 'applied', 'automation',
          jsonb_build_object('method', 'automation'));

  return 'applied';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.fail_application_attempt(uuid, uuid, text, text, boolean)',
    'public.claim_next_application(uuid, timestamptz, timestamptz)',
    'public.release_application_claim(uuid, uuid, timestamptz, text)',
    'public.complete_application_submission(uuid, uuid, jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
