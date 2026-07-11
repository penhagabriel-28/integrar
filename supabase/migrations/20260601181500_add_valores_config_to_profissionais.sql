-- Migration to add values and discounts configuration to professionals
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS valores_config JSONB DEFAULT '{"especialidades": [], "descontos": []}'::jsonb;
