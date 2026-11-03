-- YDS Immo : licence v3 — un nouvel appareil se connecte avec e-mail + mot de passe SANS ressaisir la clé.
-- À lancer APRÈS schema-licence-v2.sql (Supabase > SQL Editor > Run). Sans danger si relancé.
--
-- Avant : sur un 2e appareil, il fallait re-saisir la clé d'activation.
-- Maintenant : si la licence du compte a encore une place libre pour ce type d'appareil
-- (1 PC + 1 téléphone), l'appareil est enregistré automatiquement à la connexion.
-- Si la place est prise : « device_limit » et le client peut remplacer l'ancien appareil.

drop function if exists public.check_licence(text);

create or replace function public.check_licence(p_device_id text, p_kind text default null)
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
  if l.expires_at is null or l.expires_at + interval '7 days' <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired', 'expires_at', l.expires_at);
  end if;

  if not exists (select 1 from public.licence_devices where licence_id = l.id and device_id = p_device_id) then
    if coalesce(p_kind, '') not in ('pc', 'phone') or coalesce(p_device_id, '') = '' then
      return jsonb_build_object('ok', false, 'error', 'device_not_registered');
    end if;
    select count(*) into n from public.licence_devices where licence_id = l.id and kind = p_kind;
    lim := case when p_kind = 'pc' then l.max_pc else l.max_phone end;
    if n >= lim then
      return jsonb_build_object('ok', false, 'error', 'device_limit', 'kind', p_kind, 'can_replace', true);
    end if;
    insert into public.licence_devices (licence_id, device_id, kind) values (l.id, p_device_id, p_kind);
  end if;

  update public.licence_devices set last_seen = now()
   where licence_id = l.id and device_id = p_device_id;
  return jsonb_build_object('ok', true, 'expires_at', l.expires_at,
                            'grace', l.expires_at <= now(),
                            'grace_until', l.expires_at + interval '7 days');
end
$$;

revoke all on function public.check_licence(text, text) from public, anon;
grant execute on function public.check_licence(text, text) to authenticated;
