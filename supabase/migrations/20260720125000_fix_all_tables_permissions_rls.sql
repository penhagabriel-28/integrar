-- Safe migration to grant permissions and create RLS policies on tables that exist

DO $$
DECLARE
  tbl text;
  tables_list text[] := ARRAY[
    'profissionais', 'agendamentos', 'pacientes', 'paciente_profissional',
    'responsaveis', 'servicos', 'salas', 'faturas', 'fatura_itens', 'anamneses',
    'controle_relatorios', 'tipos_documento'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_list LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated;', tbl);
      EXECUTE format('GRANT ALL ON public.%I TO service_role;', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'public_all_' || tbl, tbl);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO public USING (true) WITH CHECK (true);', 'public_all_' || tbl, tbl);
    END IF;
  END LOOP;
END $$;
