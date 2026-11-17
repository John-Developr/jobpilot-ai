-- Private storage buckets. Objects live under "<user_id>/..." and RLS restricts
-- every operation to the owner's folder. Files are served through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents', 'documents', false, 10485760,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ]
  ),
  ('automation', 'automation', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "documents_owner_all" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Screenshots are written by the automation worker (service role); the owner can only read.
create policy "automation_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'automation' and (storage.foldername(name))[1] = (select auth.uid())::text);
