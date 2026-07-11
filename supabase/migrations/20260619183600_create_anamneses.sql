-- ============ ANAMNESES ============
CREATE TABLE public.anamneses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE CASCADE NOT NULL,
  agendamento_id UUID REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.anamneses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all anamneses" ON public.anamneses FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_anamneses_upd BEFORE UPDATE ON public.anamneses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO authenticated;
GRANT ALL ON public.anamneses TO service_role;
