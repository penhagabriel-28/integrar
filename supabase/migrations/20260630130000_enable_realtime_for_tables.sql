-- Migration to enable Supabase Realtime for agendamentos, pacientes, faturas and fatura_itens.

do $$
declare
  v_table text;
  v_tables text[] := array['agendamentos', 'pacientes', 'faturas', 'fatura_itens'];
begin
  -- Ensure publication exists
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  
  foreach v_table in array v_tables loop
    if not exists (
      select 1 
      from pg_publication_rel pr 
      join pg_class c on pr.prrelid = c.oid 
      join pg_namespace n on c.relnamespace = n.oid 
      join pg_publication p on pr.prpubid = p.oid
      where p.pubname = 'supabase_realtime' 
        and n.nspname = 'public' 
        and c.relname = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;
