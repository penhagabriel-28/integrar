
-- Permitir acesso anônimo a todas as tabelas operacionais (proteção das abas diretoria/despesas permanece no client via senha)

-- 1) Recriar policies para incluir anon explicitamente em TODAS as tabelas operacionais
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'agendamentos','anamneses','bloqueios_agenda','controle_relatorios',
    'despesas','fatura_itens','faturas','paciente_profissional','pacientes',
    'profissionais','responsaveis','salas','servicos','tipos_documento'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "public all %s" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth all %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "open all %s" ON public.%I AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- 2) user_roles e profiles continuam restritos a authenticated (sem alteração de policies existentes)
