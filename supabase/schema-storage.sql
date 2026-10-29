-- YDS Immo : stockage des photos des biens
-- À lancer APRÈS schema-licence-v2.sql (Supabase > SQL Editor > Run). Peut être relancé sans risque.
--
-- * un seul "bucket" privé nommé photos, limité aux images JPEG de 3 Mo maximum ;
-- * chaque démarcheur n'accède qu'à son propre dossier (le nom du dossier est son identifiant) ;
-- * ajouter ou supprimer une photo demande une licence valide (y compris pendant les 7 jours de grâce) ;
-- * lire une photo reste possible même si la licence a expiré.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists "photos: lire les siennes" on storage.objects;
drop policy if exists "photos: ajouter les siennes" on storage.objects;
drop policy if exists "photos: supprimer les siennes" on storage.objects;

create policy "photos: lire les siennes" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: ajouter les siennes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_valid_licence())
  );

create policy "photos: supprimer les siennes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.has_valid_licence())
  );
