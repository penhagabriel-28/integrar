-- Migration: Create whatsapp_config table for synchronizing WhatsApp billing template across all devices (Desktop, Mobile, etc.)
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  template TEXT NOT NULL,
  pix TEXT NOT NULL,
  clinica TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant permissions to public/anon/authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_config TO anon, authenticated;
GRANT ALL ON public.whatsapp_config TO service_role;

-- Enable Row Level Security and allow public read and write
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_all_whatsapp_config ON public.whatsapp_config;
CREATE POLICY public_all_whatsapp_config ON public.whatsapp_config FOR ALL TO public USING (true) WITH CHECK (true);

-- Insert or update default configuration
INSERT INTO public.whatsapp_config (id, template, pix, clinica, created_at, updated_at)
VALUES (
  'default',
  'Olá, {responsavel}! Gostaríamos de lembrar do pagamento referente aos atendimentos de {mes} de *{paciente}* no valor total de *{valor}*.{resumo}

Nosso pix: {pix}

Agradecemos a atenção! *{clinica}*',
  '59.153.399/0001-93',
  'Integrar',
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  pix = EXCLUDED.pix,
  clinica = EXCLUDED.clinica,
  template = EXCLUDED.template,
  updated_at = now();
