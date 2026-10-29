-- YDS Immo : licence v2, alignée sur YDS Beauty
-- À lancer APRÈS schema.sql, schema-licence.sql et schema-admin.sql (Supabase > SQL Editor > Run).
-- Peut être relancé sans risque.
--
-- Ce que ça change :
--   * la durée d'une licence commence à l'ACTIVATION par le client (pas à la création de la clé) ;
--   * 7 jours de grâce après la date de fin : le logiciel marche encore, avec un avertissement ;
--   * 10 essais de clé ratés par heure et par compte, puis blocage temporaire ;
--   * le client peut remplacer lui-même son PC ou son téléphone, une fois tous les 30 jours ;
--   * l'admin peut suspendre / réactiver, enregistrer un paiement, fixer la date de fin, modifier la fiche.

-- 1. Colonnes et tables ---------------------------------------------------------------------
alter table public.licences alter column expires_at drop not null;
alter table public.licences add column if not exists pending_months int;
alter table public.licences add column if not exists activated_at timestamptz;
alter table public.licences add column if not exists active boolean not null default true;
alter table public.licences add column if not exists last_replaced_at timestamptz;

create table if not exists public.licence_attempts (
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists licence_attempts_idx on public.licence_attempts (user_id, created_at);
alter table public.licence_attempts enable row level security;

create table if not exists public.licence_payments (
  id uuid primary key default gen_random_uuid(),
  licence_id uuid not null references public.licences (id) on delete cascade,
  amount int not null default 0,
  months int not null,
  method text not null default '',
  note text not null default '',
  paid_at timestamptz not null default now(),
  recorded_by uuid
);
alter table public.licence_payments enable row level security;

-- Licences créées avec la v1 : celles jamais activées passent en "durée en attente"
update public.licences
   set activated_at = coalesce(activated_at, created_at)
 where user_id is not null and activated_at is null;

update public.licences
   set pending_months = greatest(1, round(extract(epoch from (expires_at - created_at)) / 2592000)::int),
       expires_at = null
 where user_id is null and expires_at is not null and pending_months is null;

-- 2. Création et prolongation (réservées à l'admin) -----------------------------------------
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
  insert into public.licences (key, expires_at, pending_months, note)
  values (k, null, greatest(p_months, 1), coalesce(p_note, ''));
  return k;
end
$$;

-- Ajoute des mois : avant activation on augmente la durée en attente, après on repousse la date de fin
create or replace function public.licence_add_months(p_id uuid, p_months int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.licences;
  new_exp timestamptz;
begin
  select * into l from public.licences where id = p_id for update;
  if not found then
    raise exception 'licence introuvable';
  end if;
  if l.expires_at is null then
    update public.licences set pending_months = coalesce(pending_months, 0) + p_months where id = p_id;
    return null;
  end if;
  update public.licences
     set expires_at = greatest(expires_at, now()) + make_interval(months => p_months)
   where id = p_id
   returning expires_at into new_exp;
  return new_exp;
end
$$;

create or replace function public.extend_licence(p_key text, p_months int default 1)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid uuid;
begin
  select id into lid from public.licences where key = upper(trim(p_key));
  if lid is null then
    raise exception 'Clé introuvable';
  end if;
  return public.licence_add_months(lid, p_months);
end
$$;

revoke all on function public.licence_add_months(uuid, int) from public, anon, authenticated;
revoke all on function public.generate_licence(int, text) from public, anon, authenticated;
revoke all on function public.extend_licence(text, int) from public, anon, authenticated;

-- 3. Fonctions utilisées par l'application --------------------------------------------------
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
  lim int;
  fails int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;
  if p_kind not in ('pc', 'phone') or coalesce(p_device_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select count(*) into fails from public.licence_attempts
   where user_id = uid and created_at > now() - interval '1 hour';
  if fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  select * into l from public.licences where key = upper(trim(p_key));
  if not found then
    insert into public.licence_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_key');
  end if;
  if l.user_id is not null and l.user_id <> uid then
    insert into public.licence_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'key_used');
  end if;
  if not l.active then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;
  if l.expires_at is not null and l.expires_at + interval '7 days' <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  if exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    update public.licence_devices set last_seen = now()
     where licence_id = l.id and device_id = p_device_id;
  else
    select count(*) into n from public.licence_devices where licence_id = l.id and kind = p_kind;
    lim := case when p_kind = 'pc' then l.max_pc else l.max_phone end;
    if n >= lim then
      return jsonb_build_object('ok', false, 'error', 'device_limit', 'kind', p_kind,
                                'can_replace', l.user_id = uid);
    end if;
    insert into public.licence_devices (licence_id, device_id, kind) values (l.id, p_device_id, p_kind);
  end if;

  -- Première activation : la durée commence maintenant
  if l.user_id is null then
    update public.licences
       set user_id = uid,
           activated_at = now(),
           expires_at = case when pending_months is not null
                             then now() + make_interval(months => pending_months)
                             else expires_at end,
           pending_months = null
     where id = l.id
     returning * into l;
  end if;

  return jsonb_build_object('ok', true, 'expires_at', l.expires_at,
                            'grace', l.expires_at <= now(),
                            'grace_until', l.expires_at + interval '7 days');
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

  select * into l from public.licences
   where user_id = uid
   order by active desc, expires_at desc nulls last
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_licence');
  end if;
  if not l.active then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;
  if not exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    return jsonb_build_object('ok', false, 'error', 'device_not_registered');
  end if;
  if l.expires_at is null or l.expires_at + interval '7 days' <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  update public.licence_devices set last_seen = now()
   where licence_id = l.id and device_id = p_device_id;
  return jsonb_build_object('ok', true, 'expires_at', l.expires_at,
                            'grace', l.expires_at <= now(),
                            'grace_until', l.expires_at + interval '7 days');
end
$$;

-- Le client remplace lui-même son ancien PC / téléphone par cet appareil (1 fois tous les 30 jours)
create or replace function public.replace_licence_device(p_device_id text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.licences;
  removed int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_logged_in');
  end if;
  if p_kind not in ('pc', 'phone') or coalesce(p_device_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select * into l from public.licences
   where user_id = uid
   order by active desc, expires_at desc nulls last
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_licence');
  end if;
  if not l.active then
    return jsonb_build_object('ok', false, 'error', 'suspended');
  end if;
  if l.expires_at is null or l.expires_at + interval '7 days' <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  if exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    return jsonb_build_object('ok', true, 'expires_at', l.expires_at);
  end if;

  if l.last_replaced_at is not null and l.last_replaced_at > now() - interval '30 days' then
    return jsonb_build_object('ok', false, 'error', 'replace_too_soon',
                              'next_at', l.last_replaced_at + interval '30 days');
  end if;

  delete from public.licence_devices where licence_id = l.id and kind = p_kind;
  get diagnostics removed = row_count;
  insert into public.licence_devices (licence_id, device_id, kind) values (l.id, p_device_id, p_kind);
  if removed > 0 then
    update public.licences set last_replaced_at = now() where id = l.id;
  end if;

  return jsonb_build_object('ok', true, 'expires_at', l.expires_at,
                            'grace', l.expires_at <= now(),
                            'grace_until', l.expires_at + interval '7 days');
end
$$;

-- Écriture autorisée avec une licence active, y compris pendant les 7 jours de grâce
create or replace function public.has_valid_licence()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.licences
     where user_id = (select auth.uid())
       and active
       and expires_at is not null
       and expires_at + interval '7 days' > now()
  )
$$;

revoke all on function public.replace_licence_device(text, text) from public, anon;
grant execute on function public.replace_licence_device(text, text) to authenticated;

-- 4. Outil admin ----------------------------------------------------------------------------
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
      select l.id, l.key, l.note, l.expires_at, l.pending_months, l.activated_at, l.active,
             l.created_at, l.max_pc, l.max_phone, l.last_replaced_at,
             u.email as user_email,
             (select count(*) from public.licence_devices d where d.licence_id = l.id and d.kind = 'pc') as pcs,
             (select count(*) from public.licence_devices d where d.licence_id = l.id and d.kind = 'phone') as phones,
             (select max(d.last_seen) from public.licence_devices d where d.licence_id = l.id) as last_seen,
             (select coalesce(sum(p.amount), 0) from public.licence_payments p where p.licence_id = l.id) as paid_total,
             (select count(*) from public.licence_payments p where p.licence_id = l.id) as payments
        from public.licences l
        left join auth.users u on u.id = l.user_id
    ) x
  ), '[]'::jsonb);
end
$$;

create or replace function public.admin_extend_licence(p_id uuid, p_months int)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_months < 1 or p_months > 120 then raise exception 'durée invalide'; end if;
  return public.licence_add_months(p_id, p_months);
end
$$;

create or replace function public.admin_record_licence_payment(
  p_id uuid, p_amount int, p_months int, p_method text default '', p_note text default ''
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_months < 1 or p_months > 120 then raise exception 'durée invalide'; end if;
  if p_amount < 0 then raise exception 'montant invalide'; end if;
  if not exists (select 1 from public.licences where id = p_id) then raise exception 'licence introuvable'; end if;
  insert into public.licence_payments (licence_id, amount, months, method, note, recorded_by)
  values (p_id, p_amount, p_months, coalesce(p_method, ''), coalesce(p_note, ''), (select auth.uid()));
  return public.licence_add_months(p_id, p_months);
end
$$;

create or replace function public.admin_set_licence_expiry(p_id uuid, p_date timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.licences set expires_at = p_date, pending_months = null where id = p_id;
  if not found then raise exception 'licence introuvable'; end if;
end
$$;

create or replace function public.admin_set_licence_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.licences set active = p_active where id = p_id;
  if not found then raise exception 'licence introuvable'; end if;
end
$$;

create or replace function public.admin_update_licence(p_id uuid, p_note text, p_max_pc int, p_max_phone int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.licences
     set note = coalesce(p_note, ''), max_pc = greatest(p_max_pc, 0), max_phone = greatest(p_max_phone, 0)
   where id = p_id;
  if not found then raise exception 'licence introuvable'; end if;
end
$$;

-- La suspension passe par "active" (réversible) : l'ancienne fonction disparaît
drop function if exists public.admin_suspend_licence(uuid);

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_licences()',
    'admin_extend_licence(uuid, int)',
    'admin_record_licence_payment(uuid, int, int, text, text)',
    'admin_set_licence_expiry(uuid, timestamptz)',
    'admin_set_licence_active(uuid, boolean)',
    'admin_update_licence(uuid, text, int, int)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end
$$;
