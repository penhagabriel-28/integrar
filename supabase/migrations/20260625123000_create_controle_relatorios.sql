-- ============ CONTROLE DE RELATÓRIOS DE EVOLUÇÃO ============
CREATE TABLE public.controle_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE CASCADE NOT NULL,
  responsavel_nome TEXT NOT NULL,
  data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_limite DATE NOT NULL,
  data_entrega DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.controle_relatorios ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations for authenticated users (consistent with other tables in this schema)
CREATE POLICY "auth all controle_relatorios" ON public.controle_relatorios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions to authenticated and service roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_relatorios TO authenticated;
GRANT ALL ON public.controle_relatorios TO service_role;

-- Auto-update updated_at field on update
CREATE TRIGGER trg_controle_relatorios_upd BEFORE UPDATE ON public.controle_relatorios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
