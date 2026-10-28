-- YDS Immo : système de licence
-- À lancer APRÈS schema.sql (Supabase > SQL Editor > New query > Run).
--
-- Fonctionnement :
--   * une licence = une clé (ex. YDS-3F9A-0B7C-D241) qui s'active une seule fois par compte ;
--   * 1 PC + 1 téléphone par licence ;
--   * la date d'expiration fait office d'abonnement : un paiement = on prolonge la licence ;
--   * licence expirée = plus d'écriture possible côté serveur (les données restent lisibles).

-- 1. Tables (fermées au public : seules les fonctions ci-dessous y accèdent)
create table if not exists public.licences (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  max_pc int not null default 1,
  max_phone int not null default 1,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.licence_devices (
  licence_id uuid not null references public.licences (id) on delete cascade,
  device_id text not null,
  kind text not null check (kind in ('pc', 'phone')),
  last_seen timestamptz not null default now(),
  primary key (licence_id, device_id)
);

alter table public.licences enable row level security;
alter table public.licence_devices enable row level security;

-- 2. Fonctions réservées à toi (SQL Editor) : créer et prolonger une licence
create or replace function public.generate_licence(p_months int default 12, p_note text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  h text := upper(replace(gen_random_uuid()::text, '-', ''));
  k text := 'YDS-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
begin
  insert into public.licences (key, expires_at, note)
  values (k, now() + make_interval(months => p_months), p_note);
  return k;
end
$$;

create or replace function public.extend_licence(p_key text, p_months int default 1)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_exp timestamptz;
begin
  update public.licences
     set expires_at = greatest(expires_at, now()) + make_interval(months => p_months)
   where key = upper(trim(p_key))
   returning expires_at into new_exp;
  if new_exp is null then
    raise exception 'Clé introuvable';
  end if;
  return new_exp;
end
$$;

revoke all on function public.generate_licence(int, text) from public, anon, authenticated;
revoke all on function public.extend_licence(text, int) from public, anon, authenticated;

-- 3. Fonctions utilisées par l'application
create or replace function public.activate_licence(p_key text, p_device_id text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.licences;
  n int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;
  if p_kind not in ('pc', 'phone') or coalesce(p_device_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select * into l from public.licences where key = upper(trim(p_key));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if l.user_id is not null and l.user_id <> uid then
    return jsonb_build_object('ok', false, 'error', 'key_used');
  end if;
  if l.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  if exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    update public.licence_devices set last_seen = now()
     where licence_id = l.id and device_id = p_device_id;
  else
    select count(*) into n from public.licence_devices where licence_id = l.id and kind = p_kind;
    if n >= case when p_kind = 'pc' then l.max_pc else l.max_phone end then
      return jsonb_build_object('ok', false, 'error', 'device_limit', 'kind', p_kind);
    end if;
    insert into public.licence_devices (licence_id, device_id, kind) values (l.id, p_device_id, p_kind);
  end if;

  if l.user_id is null then
    update public.licences set user_id = uid where id = l.id;
  end if;

  return jsonb_build_object('ok', true, 'expires_at', l.expires_at);
end
$$;

create or replace function public.check_licence(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.licences;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;

  select * into l from public.licences where user_id = uid order by expires_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_licence');
  end if;
  if not exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'device_not_registered');
  end if;
  if l.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  update public.licence_devices set last_seen = now()
   where licence_id = l.id and device_id = p_device_id;
  return jsonb_build_object('ok', true, 'expires_at', l.expires_at);
end
$$;

create or replace function public.has_valid_licence()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.licences
     where user_id = (select auth.uid()) and expires_at > now()
  )
$$;

revoke all on function public.activate_licence(text, text, text) from public, anon;
revoke all on function public.check_licence(text) from public, anon;
revoke all on function public.has_valid_licence() from public, anon;
grant execute on function public.activate_licence(text, text, text) to authenticated;
grant execute on function public.check_licence(text) to authenticated;
grant execute on function public.has_valid_licence() to authenticated;

-- 4. Les données : lecture libre pour son propre compte, écriture seulement avec une licence valide
do $$
declare
  t text;
begin
  foreach t in array array['owners', 'properties', 'clients', 'visits', 'commissions']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('drop policy if exists "read own" on public.%I', t);
    execute format('drop policy if exists "insert own" on public.%I', t);
    execute format('drop policy if exists "update own" on public.%I', t);
    execute format('drop policy if exists "delete own" on public.%I', t);

    execute format($f$create policy "read own" on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()))$f$, t);
    execute format($f$create policy "insert own" on public.%1$I for insert to authenticated
      with check (user_id = (select auth.uid()) and public.has_valid_licence())$f$, t);
    execute format($f$create policy "update own" on public.%1$I for update to authenticated
      using (user_id = (select auth.uid()) and public.has_valid_licence())
      with check (user_id = (select auth.uid()) and public.has_valid_licence())$f$, t);
    execute format($f$create policy "delete own" on public.%1$I for delete to authenticated
      using (user_id = (select auth.uid()) and public.has_valid_licence())$f$, t);
  end loop;
end
$$;

-- Utilisation (à lancer à part, quand tu veux créer ou prolonger une licence) :
--   select public.generate_licence(12, 'Nom du client');   -- licence d'un an, renvoie la clé
--   select public.extend_licence('YDS-XXXX-XXXX-XXXX', 1); -- ajoute 1 mois
--   -- Libérer un appareil (client qui change de PC) :
--   -- delete from public.licence_devices where licence_id = (select id from public.licences where key = 'YDS-XXXX-XXXX-XXXX') and kind = 'pc';
