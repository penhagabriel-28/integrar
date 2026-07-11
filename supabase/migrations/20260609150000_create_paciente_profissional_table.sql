CREATE TABLE public.paciente_profissional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, profissional_id)
);

ALTER TABLE public.paciente_profissional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all paciente_profissional" ON public.paciente_profissional 
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO anon, authenticated;
GRANT ALL ON public.paciente_profissional TO service_role;
