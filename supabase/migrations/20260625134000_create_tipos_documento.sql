-- ============ CRIAÇÃO DA TABELA DE TIPOS DE DOCUMENTO ============
CREATE TABLE IF NOT EXISTS public.tipos_documento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all tipos_documento" ON public.tipos_documento FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento TO authenticated;
GRANT ALL ON public.tipos_documento TO service_role;

-- Inserir tipos padrão inicial
INSERT INTO public.tipos_documento (nome) VALUES 
  ('Relatório de Evolução'),
  ('Declaração'),
  ('Nota Fiscal'),
  ('Ficha de Anamnese')
ON CONFLICT (nome) DO NOTHING;

-- Adicionar a coluna tipo_documento_id na tabela controle_relatorios
ALTER TABLE public.controle_relatorios 
  ADD COLUMN IF NOT EXISTS tipo_documento_id UUID REFERENCES public.tipos_documento(id) ON DELETE SET NULL;

-- Atualizar registros existentes para apontar para o tipo padrão "Relatório de Evolução"
DO $$
DECLARE
  v_tipo_id UUID;
BEGIN
  SELECT id INTO v_tipo_id FROM public.tipos_documento WHERE nome = 'Relatório de Evolução' LIMIT 1;
  IF v_tipo_id IS NOT NULL THEN
    UPDATE public.controle_relatorios SET tipo_documento_id = v_tipo_id WHERE tipo_documento_id IS NULL;
  END IF;
END $$;
