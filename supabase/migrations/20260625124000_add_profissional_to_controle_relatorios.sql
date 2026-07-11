-- ============ ADICIONAR PROFISSIONAL AO CONTROLE DE RELATÓRIOS ============
ALTER TABLE public.controle_relatorios 
  ADD COLUMN IF NOT EXISTS profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL;
