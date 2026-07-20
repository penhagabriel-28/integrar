-- Migration to fix table permissions and RLS policies for public access (anon and authenticated)

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_itens TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO anon, authenticated;

GRANT ALL ON public.profissionais TO service_role;
GRANT ALL ON public.agendamentos TO service_role;
GRANT ALL ON public.pacientes TO service_role;
GRANT ALL ON public.paciente_profissional TO service_role;

-- Enable RLS and add public permissive policies
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "auth all profissionais" ON public.profissionais;
CREATE POLICY "public all profissionais" ON public.profissionais FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "auth all agendamentos" ON public.agendamentos;
CREATE POLICY "public all agendamentos" ON public.agendamentos FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "auth all pacientes" ON public.pacientes;
CREATE POLICY "public all pacientes" ON public.pacientes FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.paciente_profissional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all paciente_profissional" ON public.paciente_profissional;
DROP POLICY IF EXISTS "auth all paciente_profissional" ON public.paciente_profissional;
CREATE POLICY "public all paciente_profissional" ON public.paciente_profissional FOR ALL TO public USING (true) WITH CHECK (true);
