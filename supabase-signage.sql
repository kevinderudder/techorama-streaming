-- Storage for the signage controller (Image Library uploads).
-- Run once in the Supabase SQL editor of the project the controller points to.
-- Everything is scoped to the "signage" bucket, so other buckets in the project are untouched.

-- Public bucket: anyone can view files by URL (the screens need that). Max 100 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signage', 'signage', true, 104857600, array['image/*', 'video/*'])
on conflict (id) do nothing;

-- Listing, uploading and deleting need a signed-in user: the controller signs in with the
-- same e-mail and password as its Firebase login. Create that user under Authentication → Users
-- and turn OFF "Allow new users to sign up" (Authentication → Sign In / Providers), so nobody
-- else can create an account with the public key.
drop policy if exists "signage: anyone can list" on storage.objects;
drop policy if exists "signage: anyone can upload" on storage.objects;
drop policy if exists "signage: anyone can delete" on storage.objects;

create policy "signage: signed-in users can list"
  on storage.objects for select to authenticated
  using (bucket_id = 'signage');

create policy "signage: signed-in users can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'signage');

create policy "signage: signed-in users can delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'signage');
