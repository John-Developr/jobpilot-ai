-- Atomically makes one resume the user's default.
-- Runs as the caller (security invoker), so RLS still applies; the partial unique index
-- resumes_one_default_idx guarantees at most one default per user.

create or replace function public.set_default_resume(p_resume_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.resumes where id = p_resume_id and user_id = v_user_id
  ) then
    raise exception 'resume not found' using errcode = 'P0002';
  end if;

  update public.resumes
     set is_default = false
   where user_id = v_user_id and is_default and id <> p_resume_id;

  update public.resumes
     set is_default = true
   where id = p_resume_id and user_id = v_user_id;
end;
$$;

revoke execute on function public.set_default_resume(uuid) from public, anon;
grant execute on function public.set_default_resume(uuid) to authenticated;
