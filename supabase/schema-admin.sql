-- YDS Immo : outil d'administration des licences (appli séparée "admin")
-- À lancer APRÈS schema.sql et schema-licence.sql.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;  -- aucune règle : personne ne la lit directement

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

create or replace function public.admin_list_licences()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select l.id, l.key, l.note, l.expires_at, l.created_at, l.max_pc, l.max_phone,
             u.email as user_email,
             (select count(*) from public.licence_devices d where d.licence_id = l.id and d.kind = 'pc') as pcs,
             (select count(*) from public.licence_devices d where d.licence_id = l.id and d.kind = 'phone') as phones,
             (select max(d.last_seen) from public.licence_devices d where d.licence_id = l.id) as last_seen
        from public.licences l
        left join auth.users u on u.id = l.user_id
    ) x
  ), '[]'::jsonb);
end
$$;

create or replace function public.admin_create_licence(
  p_months int, p_note text default '', p_max_pc int default 1, p_max_phone int default 1
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_months < 1 or p_months > 120 then raise exception 'durée invalide'; end if;
  k := public.generate_licence(p_months, coalesce(p_note, ''));
  update public.licences set max_pc = greatest(p_max_pc, 0), max_phone = greatest(p_max_phone, 0) where key = k;
  return k;
end
$$;

create or replace function public.admin_extend_licence(p_id uuid, p_months int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exp timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_months < 1 or p_months > 120 then raise exception 'durée invalide'; end if;
  update public.licences
     set expires_at = greatest(expires_at, now()) + make_interval(months => p_months)
   where id = p_id
   returning expires_at into new_exp;
  if new_exp is null then raise exception 'licence introuvable'; end if;
  return new_exp;
end
$$;

create or replace function public.admin_suspend_licence(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.licences set expires_at = now() where id = p_id;
end
$$;

create or replace function public.admin_release_devices(p_id uuid, p_kind text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.licence_devices
   where licence_id = p_id and (p_kind is null or kind = p_kind);
end
$$;

create or replace function public.admin_delete_licence(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.licences where id = p_id and user_id is null;  -- seulement une clé jamais activée
end
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'is_admin()', 'admin_list_licences()', 'admin_create_licence(int, text, int, int)',
    'admin_extend_licence(uuid, int)', 'admin_suspend_licence(uuid)',
    'admin_release_devices(uuid, text)', 'admin_delete_licence(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;

-- Te donner les droits d'administrateur (à lancer UNE fois, après avoir créé ton compte dans l'appli) :
--   insert into public.admins (user_id) select id from auth.users where email = 'TON-EMAIL';
