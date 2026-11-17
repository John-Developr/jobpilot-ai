-- Portfolio sync: profile data copied (read-only) from the owner's portfolio database.
-- Rows that came from the portfolio carry portfolio_ref (the portfolio row id or field key).
-- The portfolio is authoritative for the fields it has; JobPilot-only fields
-- (achievements, technologies, proficiency, years, primary flag, project dates) are never touched.

alter table public.profiles add column portfolio_synced_at timestamptz;
grant update (portfolio_synced_at) on public.profiles to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['profile_links', 'professional_experiences', 'education', 'professional_skills', 'projects']
  loop
    execute format('alter table public.%I add column portfolio_ref text check (char_length(portfolio_ref) <= 200)', t);
    execute format(
      'create unique index %I on public.%I (user_id, portfolio_ref) where portfolio_ref is not null',
      t || '_portfolio_ref_idx', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_portfolio_sync: applies one portfolio snapshot atomically.
-- Per section: (1) link existing local rows chosen by the app (link_id),
-- (2) upsert by portfolio_ref (portfolio value wins when present),
-- (3) unlink rows whose portfolio item disappeared (they become local; never deleted).
-- ---------------------------------------------------------------------------
create or replace function public.apply_portfolio_sync(p_snapshot jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_counts jsonb := '{}';
  v_n integer;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;

  -- Profile -------------------------------------------------------------------
  update public.profiles p set
    full_name = coalesce(s.full_name, p.full_name),
    headline  = coalesce(s.headline, p.headline),
    summary   = coalesce(s.summary, p.summary),
    phone     = coalesce(s.phone, p.phone),
    location  = coalesce(s.location, p.location),
    portfolio_synced_at = now()
  from jsonb_to_record(coalesce(p_snapshot -> 'profile', '{}')) as s(
    full_name text, headline text, summary text, phone text, location text
  )
  where p.id = v_user_id;

  -- Links ---------------------------------------------------------------------
  update public.profile_links t set portfolio_ref = x.ref
  from jsonb_to_recordset(coalesce(p_snapshot -> 'links', '[]')) as x(ref text, link_id uuid)
  where t.id = x.link_id and t.user_id = v_user_id and t.portfolio_ref is null;

  insert into public.profile_links as t (user_id, portfolio_ref, label, url, sort_order)
  select v_user_id, x.ref, x.label, x.url, x.sort_order
  from jsonb_to_recordset(coalesce(p_snapshot -> 'links', '[]')) as x(ref text, label text, url text, sort_order integer)
  on conflict (user_id, portfolio_ref) where portfolio_ref is not null
  do update set label = excluded.label, url = excluded.url;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('links', v_n);

  update public.profile_links set portfolio_ref = null
  where user_id = v_user_id and portfolio_ref is not null
    and portfolio_ref not in (select x.ref from jsonb_to_recordset(coalesce(p_snapshot -> 'links', '[]')) as x(ref text));

  -- Experience ----------------------------------------------------------------
  update public.professional_experiences t set portfolio_ref = x.ref
  from jsonb_to_recordset(coalesce(p_snapshot -> 'experiences', '[]')) as x(ref text, link_id uuid)
  where t.id = x.link_id and t.user_id = v_user_id and t.portfolio_ref is null;

  insert into public.professional_experiences as t (
    user_id, portfolio_ref, company, title, location, employment_type, start_date, end_date, is_current, description
  )
  select v_user_id, x.ref, x.company, x.title, x.location, x.employment_type, x.start_date, x.end_date, x.is_current, x.description
  from jsonb_to_recordset(coalesce(p_snapshot -> 'experiences', '[]')) as x(
    ref text, company text, title text, location text, employment_type public.employment_type,
    start_date date, end_date date, is_current boolean, description text
  )
  on conflict (user_id, portfolio_ref) where portfolio_ref is not null
  do update set
    company = excluded.company,
    title = excluded.title,
    location = coalesce(excluded.location, t.location),
    employment_type = coalesce(excluded.employment_type, t.employment_type),
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_current = excluded.is_current,
    description = coalesce(excluded.description, t.description);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('experiences', v_n);

  update public.professional_experiences set portfolio_ref = null
  where user_id = v_user_id and portfolio_ref is not null
    and portfolio_ref not in (select x.ref from jsonb_to_recordset(coalesce(p_snapshot -> 'experiences', '[]')) as x(ref text));

  -- Education -----------------------------------------------------------------
  update public.education t set portfolio_ref = x.ref
  from jsonb_to_recordset(coalesce(p_snapshot -> 'education', '[]')) as x(ref text, link_id uuid)
  where t.id = x.link_id and t.user_id = v_user_id and t.portfolio_ref is null;

  insert into public.education as t (user_id, portfolio_ref, institution, degree, start_date, end_date, description)
  select v_user_id, x.ref, x.institution, x.degree, x.start_date, x.end_date, x.description
  from jsonb_to_recordset(coalesce(p_snapshot -> 'education', '[]')) as x(
    ref text, institution text, degree text, start_date date, end_date date, description text
  )
  on conflict (user_id, portfolio_ref) where portfolio_ref is not null
  do update set
    institution = excluded.institution,
    degree = coalesce(excluded.degree, t.degree),
    start_date = coalesce(excluded.start_date, t.start_date),
    end_date = coalesce(excluded.end_date, t.end_date),
    description = coalesce(excluded.description, t.description);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('education', v_n);

  update public.education set portfolio_ref = null
  where user_id = v_user_id and portfolio_ref is not null
    and portfolio_ref not in (select x.ref from jsonb_to_recordset(coalesce(p_snapshot -> 'education', '[]')) as x(ref text));

  -- Skills (name/category/primary set only on creation; local details are kept) --
  update public.professional_skills t set portfolio_ref = x.ref
  from jsonb_to_recordset(coalesce(p_snapshot -> 'skills', '[]')) as x(ref text, link_id uuid)
  where t.id = x.link_id and t.user_id = v_user_id and t.portfolio_ref is null;

  insert into public.professional_skills (user_id, portfolio_ref, name, category, is_primary)
  select v_user_id, x.ref, x.name, x.category, x.is_primary
  from jsonb_to_recordset(coalesce(p_snapshot -> 'skills', '[]')) as x(
    ref text, link_id uuid, name text, category public.skill_category, is_primary boolean
  )
  where x.link_id is null
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('skills', v_n);

  update public.professional_skills set portfolio_ref = null
  where user_id = v_user_id and portfolio_ref is not null
    and portfolio_ref not in (select x.ref from jsonb_to_recordset(coalesce(p_snapshot -> 'skills', '[]')) as x(ref text));

  -- Projects (dates stay local: the portfolio only has a free-text period) ------
  update public.projects t set portfolio_ref = x.ref
  from jsonb_to_recordset(coalesce(p_snapshot -> 'projects', '[]')) as x(ref text, link_id uuid)
  where t.id = x.link_id and t.user_id = v_user_id and t.portfolio_ref is null;

  insert into public.projects as t (
    user_id, portfolio_ref, name, role, description, url, repository_url, technologies, highlights, sort_order
  )
  select v_user_id, x.ref, x.name, x.role, x.description, x.url, x.repository_url,
         coalesce(x.technologies, '{}'), coalesce(x.highlights, '{}'), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_snapshot -> 'projects', '[]')) as x(
    ref text, name text, role text, description text, url text, repository_url text,
    technologies text[], highlights text[], sort_order integer
  )
  on conflict (user_id, portfolio_ref) where portfolio_ref is not null
  do update set
    name = excluded.name,
    role = coalesce(excluded.role, t.role),
    description = coalesce(excluded.description, t.description),
    url = coalesce(excluded.url, t.url),
    repository_url = coalesce(excluded.repository_url, t.repository_url),
    technologies = case when cardinality(excluded.technologies) > 0 then excluded.technologies else t.technologies end,
    highlights = case when cardinality(excluded.highlights) > 0 then excluded.highlights else t.highlights end,
    sort_order = excluded.sort_order;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('projects', v_n);

  update public.projects set portfolio_ref = null
  where user_id = v_user_id and portfolio_ref is not null
    and portfolio_ref not in (select x.ref from jsonb_to_recordset(coalesce(p_snapshot -> 'projects', '[]')) as x(ref text));

  return v_counts;
end;
$$;

revoke execute on function public.apply_portfolio_sync(jsonb) from public, anon;
grant execute on function public.apply_portfolio_sync(jsonb) to authenticated;
