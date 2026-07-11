-- Make public.profissionais RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "public all profissionais" ON public.profissionais;
CREATE POLICY "public all profissionais" ON public.profissionais FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.profissionais TO anon, authenticated;

-- Make public.pacientes RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "public all pacientes" ON public.pacientes;
CREATE POLICY "public all pacientes" ON public.pacientes FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.pacientes TO anon, authenticated;

-- Make public.responsaveis RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all responsaveis" ON public.responsaveis;
DROP POLICY IF EXISTS "public all responsaveis" ON public.responsaveis;
CREATE POLICY "public all responsaveis" ON public.responsaveis FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.responsaveis TO anon, authenticated;

-- Make public.anamneses RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all anamneses" ON public.anamneses;
DROP POLICY IF EXISTS "public all anamneses" ON public.anamneses;
CREATE POLICY "public all anamneses" ON public.anamneses FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.anamneses TO anon, authenticated;

-- Make public.servicos RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all servicos" ON public.servicos;
DROP POLICY IF EXISTS "public all servicos" ON public.servicos;
CREATE POLICY "public all servicos" ON public.servicos FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.servicos TO anon, authenticated;

-- Make public.salas RLS policy fully permissive for anyone (public)
DROP POLICY IF EXISTS "auth all salas" ON public.salas;
DROP POLICY IF EXISTS "public all salas" ON public.salas;
CREATE POLICY "public all salas" ON public.salas FOR ALL TO public USING (true) WITH CHECK (true);
GRANT ALL ON public.salas TO anon, authenticated;
