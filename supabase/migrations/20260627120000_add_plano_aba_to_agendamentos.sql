-- Add plano_aba JSONB column to agendamentos table
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS plano_aba JSONB;
