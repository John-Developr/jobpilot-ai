-- JobPilot AI — initial schema.
-- Every user-owned row carries user_id and is protected by RLS (user_id = auth.uid()).
-- Child tables use composite foreign keys (parent_id, user_id) so a row can never
-- reference another user's parent, which keeps the schema safe for future multi-user use.
-- See docs/database/database-schema.md.

-- ---------------------------------------------------------------------------
-- Extensions and helpers
-- ---------------------------------------------------------------------------

create extension if not exists citext with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.employment_type as enum (
  'full_time', 'part_time', 'contract', 'freelance', 'internship', 'temporary', 'other'
);

create type public.remote_type as enum ('remote', 'hybrid', 'onsite', 'unknown');

create type public.salary_period as enum ('hour', 'day', 'month', 'year');

create type public.skill_category as enum (
  'language', 'framework', 'platform', 'database', 'cloud', 'tool', 'practice', 'other'
);

create type public.source_kind as enum ('api', 'feed', 'career_page', 'manual');

create type public.requirement_kind as enum (
  'skill', 'experience', 'education', 'responsibility', 'other'
);

create type public.qualification_level as enum (
  'high_priority', 'recommended', 'manual_review', 'archive'
);

create type public.application_status as enum (
  'discovered', 'analyzing', 'qualified', 'drafting', 'pending_approval', 'approved',
  'scheduled', 'applying', 'applied', 'failed', 'interview', 'assessment', 'rejected',
  'withdrawn', 'archived'
);

create type public.submission_method as enum ('automation', 'manual');

create type public.document_kind as enum (
  'resume', 'cover_letter', 'application_email', 'resume_summary', 'recruiter_message',
  'skills_emphasis'
);

create type public.answer_source as enum ('profile', 'ai', 'user');

create type public.run_kind as enum (
  'discovery', 'analysis', 'generation', 'submission', 'maintenance'
);

create type public.run_status as enum (
  'queued', 'running', 'succeeded', 'failed', 'needs_attention', 'cancelled'
);

create type public.event_actor as enum ('user', 'system', 'automation');

create type public.notification_type as enum (
  'job_qualified', 'approval_needed', 'submission_succeeded', 'submission_failed',
  'interview_invitation', 'follow_up_due', 'automation_failure'
);

create type public.connection_status as enum ('connected', 'expired', 'revoked', 'error');

-- ---------------------------------------------------------------------------
-- Profile and professional data
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  headline text,
  email extensions.citext,
  phone text,
  location text,
  summary text,
  years_of_experience numeric(4, 1) check (years_of_experience >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  url text not null check (url ~* '^https?://'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profile_links_user_idx on public.profile_links (user_id, sort_order);

create table public.job_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  desired_titles text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  employment_types public.employment_type[] not null default '{full_time}',
  accepted_remote_types public.remote_type[] not null default '{remote}',
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  salary_currency char(3) not null default 'PHP',
  salary_period public.salary_period not null default 'month',
  willing_to_relocate boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_preferences_salary_range check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  )
);

create table public.professional_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company text not null,
  title text not null,
  location text,
  employment_type public.employment_type,
  remote_type public.remote_type,
  start_date date not null,
  end_date date,
  is_current boolean not null default false,
  description text,
  achievements text[] not null default '{}',
  technologies text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_experiences_dates check (end_date is null or end_date >= start_date),
  constraint professional_experiences_current check (not (is_current and end_date is not null))
);
create index professional_experiences_user_idx
  on public.professional_experiences (user_id, start_date desc);

create table public.professional_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name extensions.citext not null check (char_length(name) between 1 and 80),
  category public.skill_category not null default 'other',
  proficiency smallint check (proficiency between 1 and 5),
  years_of_experience numeric(4, 1) check (years_of_experience >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_skills_unique_name unique (user_id, name)
);

create table public.education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  institution text not null,
  degree text,
  field_of_study text,
  start_date date,
  end_date date,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_dates check (
    start_date is null or end_date is null or end_date >= start_date
  )
);
create index education_user_idx on public.education (user_id, sort_order);

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  issuer text,
  issued_on date,
  expires_on date,
  credential_url text check (credential_url is null or credential_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certifications_dates check (
    issued_on is null or expires_on is null or expires_on >= issued_on
  )
);
create index certifications_user_idx on public.certifications (user_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  role text,
  description text,
  url text check (url is null or url ~* '^https?://'),
  repository_url text check (repository_url is null or repository_url ~* '^https?://'),
  technologies text[] not null default '{}',
  highlights text[] not null default '{}',
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id, sort_order);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  target_category text,
  summary text,
  emphasized_skills text[] not null default '{}',
  -- Optional uploaded file in the private "documents" bucket: <user_id>/resumes/<file>.
  storage_path text,
  mime_type text,
  file_size_bytes integer check (file_size_bytes > 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resumes_id_user_unique unique (id, user_id)
);
create index resumes_user_idx on public.resumes (user_id, updated_at desc);
-- At most one default resume per user.
create unique index resumes_one_default_idx on public.resumes (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Job discovery
-- ---------------------------------------------------------------------------

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Connector key from the code registry (e.g. 'remoteok', 'manual').
  connector_key text not null check (connector_key ~ '^[a-z0-9_]+$'),
  name text not null,
  kind public.source_kind not null,
  is_enabled boolean not null default true,
  -- Non-secret connector settings (search keywords, feed URL, ...). Secrets never go here.
  config jsonb not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sources_unique_connector unique (user_id, connector_key),
  constraint job_sources_id_user_unique unique (id, user_id)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid,
  external_id text,
  url text not null check (url ~* '^https?://'),
  -- Normalized URL + title/company fingerprint used for duplicate detection.
  dedupe_hash text not null,
  title text not null,
  company text not null,
  location text,
  remote_type public.remote_type not null default 'unknown',
  employment_type public.employment_type,
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  salary_currency char(3),
  salary_period public.salary_period,
  description text,
  posted_at timestamptz,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_salary_range check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  ),
  constraint jobs_dedupe_unique unique (user_id, dedupe_hash),
  constraint jobs_id_user_unique unique (id, user_id),
  constraint jobs_source_fk foreign key (source_id, user_id)
    references public.job_sources (id, user_id) on delete set null (source_id)
);
create unique index jobs_source_external_idx
  on public.jobs (user_id, source_id, external_id) where external_id is not null;
create index jobs_user_discovered_idx on public.jobs (user_id, discovered_at desc);
create index jobs_source_idx on public.jobs (source_id);

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  kind public.requirement_kind not null,
  description text not null,
  is_required boolean not null default true,
  min_years numeric(4, 1) check (min_years >= 0),
  created_at timestamptz not null default now(),
  constraint job_requirements_job_fk foreign key (job_id, user_id)
    references public.jobs (id, user_id) on delete cascade
);
create index job_requirements_job_idx on public.job_requirements (job_id);

-- ---------------------------------------------------------------------------
-- AI prompts and evaluation
-- ---------------------------------------------------------------------------

-- System-wide prompt registry; written only by the service role (migrations/seed/scripts).
create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null check (prompt_key ~ '^[a-z0-9_.]+$'),
  version integer not null check (version > 0),
  description text,
  template text not null,
  output_schema jsonb,
  default_model text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prompt_versions_unique unique (prompt_key, version)
);
create unique index prompt_versions_one_active_idx
  on public.prompt_versions (prompt_key) where is_active;

create table public.job_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  overall_score smallint not null check (overall_score between 0 and 100),
  qualification public.qualification_level not null,
  -- { technical_skills: 0-100, experience: 0-100, ... } and the weights used for this run.
  criteria_scores jsonb not null,
  criteria_weights jsonb not null,
  matched_skills text[] not null default '{}',
  missing_skills text[] not null default '{}',
  experience_gaps text[] not null default '{}',
  positive_factors text[] not null default '{}',
  negative_factors text[] not null default '{}',
  explanation text not null,
  model text not null,
  prompt_version_id uuid references public.prompt_versions (id) on delete restrict,
  evaluated_at timestamptz not null default now(),
  constraint job_scores_job_fk foreign key (job_id, user_id)
    references public.jobs (id, user_id) on delete cascade
);
create index job_scores_job_idx on public.job_scores (job_id, evaluated_at desc);
create index job_scores_user_score_idx on public.job_scores (user_id, overall_score desc);
create index job_scores_prompt_idx on public.job_scores (prompt_version_id);

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid not null,
  status public.application_status not null default 'discovered',
  priority smallint not null default 0 check (priority between 0 and 100),
  resume_id uuid,
  match_score smallint check (match_score between 0 and 100),
  approved_at timestamptz,
  scheduled_for timestamptz,
  submitted_at timestamptz,
  submission_method public.submission_method,
  -- Set only by the submission service after the confirmation is verified.
  submission_verified_at timestamptz,
  -- Duplicate-submission protection (written by the service role only).
  idempotency_key uuid not null default gen_random_uuid(),
  lock_token uuid,
  locked_at timestamptz,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  last_error text,
  recruiter_name text,
  recruiter_email extensions.citext,
  recruiter_contact text,
  next_interview_at timestamptz,
  follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_one_per_job unique (user_id, job_id),
  constraint applications_idempotency_unique unique (idempotency_key),
  constraint applications_id_user_unique unique (id, user_id),
  constraint applications_job_fk foreign key (job_id, user_id)
    references public.jobs (id, user_id) on delete cascade,
  constraint applications_resume_fk foreign key (resume_id, user_id)
    references public.resumes (id, user_id) on delete set null (resume_id),
  -- An automated submission is only "applied" once verified.
  constraint applications_verified_automation check (
    status <> 'applied' or submission_method <> 'automation' or submission_verified_at is not null
  ),
  constraint applications_lock_pair check ((lock_token is null) = (locked_at is null))
);
create index applications_user_status_idx
  on public.applications (user_id, status, priority desc, created_at);
create index applications_scheduled_idx
  on public.applications (user_id, scheduled_for) where status = 'scheduled';
create index applications_submitted_idx
  on public.applications (user_id, submitted_at) where submitted_at is not null;
create index applications_follow_up_idx
  on public.applications (user_id, follow_up_at) where follow_up_at is not null;
create index applications_resume_idx on public.applications (resume_id);

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  kind public.document_kind not null,
  version integer not null default 1 check (version > 0),
  title text,
  content text not null,
  -- Exported file in the private "documents" bucket, if any.
  storage_path text,
  is_approved boolean not null default false,
  model text,
  prompt_version_id uuid references public.prompt_versions (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_documents_version_unique unique (application_id, kind, version),
  constraint application_documents_application_fk foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade
);
create index application_documents_prompt_idx on public.application_documents (prompt_version_id);

create table public.application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  question text not null,
  answer text not null,
  source public.answer_source not null,
  -- Automation only submits answers the user has verified.
  is_verified boolean not null default false,
  model text,
  prompt_version_id uuid references public.prompt_versions (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_answers_application_fk foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade
);
create index application_answers_application_idx on public.application_answers (application_id);
create index application_answers_prompt_idx on public.application_answers (prompt_version_id);

-- Append-only audit log of everything that happens to an application.
create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  event_type text not null check (event_type ~ '^[a-z_.]+$'),
  from_status public.application_status,
  to_status public.application_status,
  actor public.event_actor not null,
  message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint application_events_application_fk foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade
);
create index application_events_application_idx
  on public.application_events (application_id, created_at desc);
create index application_events_user_idx on public.application_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Automation
-- ---------------------------------------------------------------------------

create table public.automation_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_enabled boolean not null default false,
  -- Emergency pause: blocks every submission immediately, regardless of schedule.
  is_paused boolean not null default false,
  paused_at timestamptz,
  paused_reason text,
  timezone text not null default 'Asia/Manila',
  -- ISO weekdays: 1 = Monday ... 7 = Sunday.
  working_days smallint[] not null default '{1,2,3,4,5}',
  window_start time not null default '09:00',
  window_end time not null default '17:00',
  daily_application_limit smallint not null default 10 check (daily_application_limit between 0 and 100),
  min_match_score smallint not null default 70 check (min_match_score between 0 and 100),
  require_approval boolean not null default true,
  max_retries smallint not null default 3 check (max_retries between 0 and 10),
  retry_backoff_minutes integer not null default 30 check (retry_backoff_minutes between 1 and 1440),
  scoring_weights jsonb not null default
    '{"technical_skills":30,"experience":20,"responsibilities":20,"remote":15,"salary":10,"employment_type":5}',
  notification_preferences jsonb not null default '{"in_app":true,"email":false}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_settings_window check (window_start < window_end),
  constraint automation_settings_days check (
    working_days <@ '{1,2,3,4,5,6,7}'::smallint[]
  ),
  constraint automation_settings_pause check (not is_paused or paused_at is not null)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.run_kind not null,
  status public.run_status not null default 'queued',
  application_id uuid,
  job_source_id uuid,
  -- Trigger.dev run id, for cross-referencing worker logs.
  external_run_id text,
  idempotency_key text,
  attempt smallint not null default 1 check (attempt > 0),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  -- Ordered step log: [{ at, level, message, data }].
  log jsonb not null default '[]',
  -- Storage paths of screenshots in the private "automation" bucket.
  screenshot_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint automation_runs_idempotency_unique unique (user_id, idempotency_key),
  constraint automation_runs_application_fk foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete set null (application_id),
  constraint automation_runs_source_fk foreign key (job_source_id, user_id)
    references public.job_sources (id, user_id) on delete set null (job_source_id)
);
create index automation_runs_user_idx on public.automation_runs (user_id, created_at desc);
create index automation_runs_application_idx on public.automation_runs (application_id);
create index automation_runs_source_idx on public.automation_runs (job_source_id);

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  status public.connection_status not null,
  account_label text,
  -- Reference to a Supabase Vault secret. Raw credentials are never stored in this table.
  vault_secret_id uuid,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_unique unique (user_id, provider)
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null,
  model text not null,
  prompt_version_id uuid references public.prompt_versions (id) on delete restrict,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  estimated_cost_usd numeric(10, 6) check (estimated_cost_usd >= 0),
  latency_ms integer check (latency_ms >= 0),
  succeeded boolean not null,
  error_code text,
  created_at timestamptz not null default now()
);
create index ai_usage_events_user_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_events_prompt_idx on public.ai_usage_events (prompt_version_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  link_path text check (link_path is null or link_path ~ '^/'),
  -- Prevents the same event from notifying twice (e.g. 'approval_needed:<application_id>').
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_dedupe_unique unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'profile_links', 'job_preferences', 'professional_experiences',
    'professional_skills', 'education', 'certifications', 'projects', 'resumes',
    'job_sources', 'jobs', 'applications', 'application_documents', 'application_answers',
    'automation_settings', 'integration_connections'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- New-user bootstrap: one profile, preferences and settings row per account.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.job_preferences (user_id) values (new.id);
  insert into public.automation_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Owner has full access to their own content.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profile_links', 'job_preferences', 'professional_experiences', 'professional_skills',
    'education', 'certifications', 'projects', 'resumes', 'job_sources', 'jobs',
    'job_requirements', 'job_scores', 'applications', 'application_documents',
    'application_answers', 'automation_settings', 'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated
       using (user_id = (select auth.uid()))
       with check (user_id = (select auth.uid()))', t
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
create policy "owner_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "owner_update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Audit log: owner may read and append, never rewrite history.
alter table public.application_events enable row level security;
create policy "owner_select" on public.application_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner_insert" on public.application_events for insert to authenticated
  with check (user_id = (select auth.uid()) and actor = 'user');

-- Written by background workers (service role); owner reads only.
do $$
declare
  t text;
begin
  foreach t in array array['automation_runs', 'ai_usage_events', 'integration_connections']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner_select" on public.%I for select to authenticated
       using (user_id = (select auth.uid()))', t
    );
  end loop;
end;
$$;

alter table public.prompt_versions enable row level security;
create policy "authenticated_select" on public.prompt_versions for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Column-level guards
-- ---------------------------------------------------------------------------

-- Submission bookkeeping on applications is owned by the submission service (service role).
-- Users can edit tracking fields and statuses, but cannot forge a verified submission
-- or tamper with locks and idempotency keys.
revoke insert, update on public.applications from anon, authenticated;
grant insert (
  user_id, job_id, status, priority, resume_id, match_score, recruiter_name, recruiter_email,
  recruiter_contact, next_interview_at, follow_up_at, notes
) on public.applications to authenticated;
grant update (
  status, priority, resume_id, approved_at, scheduled_for, submitted_at, submission_method,
  recruiter_name, recruiter_email, recruiter_contact, next_interview_at, follow_up_at, notes
) on public.applications to authenticated;

-- The email on the profile mirrors auth.users and is not user-editable here.
revoke update on public.profiles from anon, authenticated;
grant update (
  full_name, headline, phone, location, summary, years_of_experience
) on public.profiles to authenticated;

-- The app has no public pages that read data; anon never needs table access.
revoke all on all tables in schema public from anon;
