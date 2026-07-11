-- Adicionar coluna cpf na tabela pacientes
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cpf TEXT;

-- Adicionar colunas de notas fiscais na tabela controle_relatorios
ALTER TABLE public.controle_relatorios 
  ADD COLUMN IF NOT EXISTS responsavel_cpf TEXT,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS especialidades TEXT;
