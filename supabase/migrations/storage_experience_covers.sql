-- Cria o bucket público para capas de experiências
-- Execute via: Supabase Dashboard > SQL Editor, ou supabase db push

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'experience-covers',
  'experience-covers',
  true,
  5242880,   -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Política: qualquer pessoa pode ler (imagens públicas do site)
create policy "Public read experience-covers"
  on storage.objects for select
  using ( bucket_id = 'experience-covers' );

-- Política: apenas usuários autenticados podem fazer upload
create policy "Auth upload experience-covers"
  on storage.objects for insert
  with check (
    bucket_id = 'experience-covers'
    and auth.role() = 'authenticated'
  );

-- Política: apenas usuários autenticados podem deletar
create policy "Auth delete experience-covers"
  on storage.objects for delete
  using (
    bucket_id = 'experience-covers'
    and auth.role() = 'authenticated'
  );
