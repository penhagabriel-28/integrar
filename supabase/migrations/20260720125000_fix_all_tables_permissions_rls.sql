-- Safe migration to grant permissions, ensure missing columns, and create RLS policies on tables that exist

-- 1. Ensure missing columns exist on public tables
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS especialidade TEXT;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL;

ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS valores_config JSONB DEFAULT '{"especialidades": [], "descontos": []}'::jsonb;

ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_frequencia TEXT DEFAULT 'avulso';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_valor_personalizado NUMERIC(10,2);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cpf TEXT;

ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS assinatura_responsavel TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS nome_assinante TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_assinatura TIMESTAMPTZ;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS plano_aba JSONB;

-- 2. Grant permissions and enable RLS
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
