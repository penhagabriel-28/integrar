-- Add signature columns to agendamentos table to enable digital attendance
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS assinatura_responsavel text;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS nome_assinante text;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS data_assinatura timestamp with time zone;
