-- YDS Immo : tables de synchronisation
-- À coller dans Supabase > SQL Editor > New query, puis cliquer sur "Run".
-- Chaque démarcheur ne voit et ne modifie que ses propres données (Row Level Security).

do $$
declare
  t text;
begin
  foreach t in array array['owners', 'properties', 'clients', 'visits', 'commissions']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key,
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        data jsonb not null default '{}'::jsonb,
        updated_at bigint not null,
        deleted boolean not null default false
      )$f$, t);

    execute format('create index if not exists %1$I on public.%2$I (user_id, updated_at)', t || '_user_updated_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format($f$
      create policy "own rows" on public.%1$I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))$f$, t);
  end loop;
end
$$;
