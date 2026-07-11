
CREATE TYPE public.fatura_status AS ENUM ('aberta','paga','vencida','cancelada');
CREATE TYPE public.metodo_pagamento AS ENUM ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','boleto','convenio','outro');

CREATE TABLE public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL,
  competencia date NOT NULL,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  status fatura_status NOT NULL DEFAULT 'aberta',
  vencimento date,
  pago_em timestamptz,
  metodo metodo_pagamento,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturas TO authenticated;
GRANT ALL ON public.faturas TO service_role;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all faturas" ON public.faturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.fatura_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  agendamento_id uuid,
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  valor_unitario numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_itens TO authenticated;
GRANT ALL ON public.fatura_itens TO service_role;
ALTER TABLE public.fatura_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all fatura_itens" ON public.fatura_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER faturas_updated_at BEFORE UPDATE ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_faturas_paciente ON public.faturas(paciente_id);
CREATE INDEX idx_faturas_status ON public.faturas(status);
CREATE INDEX idx_fatura_itens_fatura ON public.fatura_itens(fatura_id);
