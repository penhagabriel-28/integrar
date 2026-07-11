-- Migration to create the despesas (expenses) table

CREATE TABLE public.despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant access to authenticated and service roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas TO authenticated;
GRANT ALL ON public.despesas TO service_role;

-- Enable Row Level Security
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (consistent with other tables in this schema)
CREATE POLICY "auth all despesas" ON public.despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at field on update
CREATE TRIGGER despesas_updated_at BEFORE UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
