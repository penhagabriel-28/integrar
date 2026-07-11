-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'recepcionista', 'profissional');
CREATE TYPE public.paciente_status AS ENUM ('ativo', 'inativo', 'lista_espera');
CREATE TYPE public.tipo_atendimento AS ENUM ('particular', 'convenio');
CREATE TYPE public.agendamento_status AS ENUM ('pendente', 'confirmado', 'cancelado', 'realizado', 'falta');
CREATE TYPE public.recorrencia_tipo AS ENUM ('unica', 'semanal', 'quinzenal', 'mensal');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read user_roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ AUTO PROFILE + FIRST USER = ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email);

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ PROFISSIONAIS ============
CREATE TABLE public.profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  especialidade TEXT,
  registro TEXT,
  email TEXT,
  telefone TEXT,
  cor TEXT NOT NULL DEFAULT '#3b82f6',
  valor_sessao NUMERIC(10,2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO authenticated;
GRANT ALL ON public.profissionais TO service_role;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all profissionais" ON public.profissionais FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_prof_upd BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SERVICOS ============
CREATE TABLE public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL DEFAULT 50,
  cor TEXT NOT NULL DEFAULT '#fb923c',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all servicos" ON public.servicos FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.servicos (nome, duracao_minutos) VALUES
  ('ABA', 60), ('Fonoaudiologia', 45), ('Psicologia', 50),
  ('Terapia Ocupacional', 50), ('Psicopedagogia', 50);

-- ============ SALAS ============
CREATE TABLE public.salas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO authenticated;
GRANT ALL ON public.salas TO service_role;
ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all salas" ON public.salas FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.salas (nome) VALUES ('Sala 1'), ('Sala 2'), ('Sala 3');

-- ============ PACIENTES ============
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  data_nascimento DATE,
  cid_principal TEXT,
  cids_secundarios TEXT[],
  tipo_atendimento public.tipo_atendimento NOT NULL DEFAULT 'particular',
  convenio_nome TEXT,
  observacoes TEXT,
  foto_url TEXT,
  status public.paciente_status NOT NULL DEFAULT 'ativo',
  valor_mensal NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
GRANT ALL ON public.pacientes TO service_role;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all pacientes" ON public.pacientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_pac_upd BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RESPONSAVEIS ============
CREATE TABLE public.responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  parentesco TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO authenticated;
GRANT ALL ON public.responsaveis TO service_role;
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all responsaveis" ON public.responsaveis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_resp_paciente ON public.responsaveis(paciente_id);

-- ============ AGENDAMENTOS ============
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  servico_id UUID REFERENCES public.servicos(id) ON DELETE SET NULL,
  sala_id UUID REFERENCES public.salas(id) ON DELETE SET NULL,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  status public.agendamento_status NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  motivo_cancelamento TEXT,
  recorrencia public.recorrencia_tipo NOT NULL DEFAULT 'unica',
  recorrencia_grupo UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agendamentos" ON public.agendamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_ag_upd BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ag_inicio ON public.agendamentos(data_inicio);
CREATE INDEX idx_ag_profissional ON public.agendamentos(profissional_id);
CREATE INDEX idx_ag_paciente ON public.agendamentos(paciente_id);

-- ============ BLOQUEIOS ============
CREATE TABLE public.bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE CASCADE,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloqueios_agenda TO authenticated;
GRANT ALL ON public.bloqueios_agenda TO service_role;
ALTER TABLE public.bloqueios_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all bloqueios" ON public.bloqueios_agenda FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
-- Migration to add values and discounts configuration to professionals
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS valores_config JSONB DEFAULT '{"especialidades": [], "descontos": []}'::jsonb;
-- Migration to sync agendamentos with faturas and fatura_itens when status is 'confirmado'

CREATE OR REPLACE FUNCTION public.fn_get_especialidade(
  p_servico_id uuid,
  p_paciente_id uuid,
  p_profissional_id uuid
) RETURNS text AS $$
DECLARE
  v_servico_nome text;
  v_pac_cids text[];
  v_prof_especialidade text;
  v_prof_specs text[];
  v_spec text;
  v_ps text;
BEGIN
  -- 1. Check servico_id
  IF p_servico_id IS NOT NULL THEN
    SELECT nome INTO v_servico_nome FROM public.servicos WHERE id = p_servico_id;
    IF v_servico_nome IS NOT NULL THEN
      RETURN v_servico_nome;
    END IF;
  END IF;

  -- 2. Get patient cids_secundarios
  SELECT cids_secundarios INTO v_pac_cids FROM public.pacientes WHERE id = p_paciente_id;
  
  -- 3. Get professional specialties
  SELECT especialidade INTO v_prof_especialidade FROM public.profissionais WHERE id = p_profissional_id;
  
  IF v_prof_especialidade IS NOT NULL AND v_prof_especialidade <> '' THEN
    -- Convert comma separated list to array, trimming each element
    SELECT array_agg(trim(s)) INTO v_prof_specs
    FROM unnest(string_to_array(v_prof_especialidade, ',')) s
    WHERE trim(s) <> '';
  END IF;

  -- 4. Check intersection
  IF v_pac_cids IS NOT NULL AND array_length(v_pac_cids, 1) > 0 AND v_prof_specs IS NOT NULL AND array_length(v_prof_specs, 1) > 0 THEN
    FOREACH v_spec IN ARRAY v_pac_cids LOOP
      FOREACH v_ps IN ARRAY v_prof_specs LOOP
        IF lower(v_spec) = lower(v_ps) THEN
          RETURN v_spec;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- 5. Fallback to first professional specialty
  IF v_prof_specs IS NOT NULL AND array_length(v_prof_specs, 1) > 0 THEN
    RETURN v_prof_specs[1];
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_get_pricing(
  p_paciente_id uuid,
  p_profissional_id uuid,
  p_especialidade text,
  p_tipo_agendamento text
) RETURNS numeric AS $$
DECLARE
  v_valor_sessao numeric;
  v_valores_config jsonb;
  v_descontos jsonb;
  v_especialidades jsonb;
  v_d jsonb;
  v_e jsonb;
  v_discount_sessao numeric;
  v_discount_avaliacao numeric;
  v_spec_sessao numeric;
  v_spec_avaliacao numeric;
BEGIN
  -- Get professional defaults
  SELECT valor_sessao, valores_config INTO v_valor_sessao, v_valores_config
  FROM public.profissionais
  WHERE id = p_profissional_id;

  IF v_valores_config IS NOT NULL THEN
    v_descontos := v_valores_config->'descontos';
    v_especialidades := v_valores_config->'especialidades';
  END IF;

  -- 1. Check custom patient discount
  IF v_descontos IS NOT NULL AND jsonb_array_length(v_descontos) > 0 THEN
    FOR v_d IN SELECT jsonb_array_elements(v_descontos) LOOP
      IF (v_d->>'paciente_id')::uuid = p_paciente_id AND lower(v_d->>'especialidade') = lower(p_especialidade) THEN
        v_discount_sessao := (v_d->>'valor_sessao')::numeric;
        v_discount_avaliacao := (v_d->>'valor_avaliacao')::numeric;
        
        IF p_tipo_agendamento = 'anamnese' THEN
          RETURN COALESCE(v_discount_avaliacao, v_discount_sessao, 0);
        ELSE
          RETURN COALESCE(v_discount_sessao, 0);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2. Check standard specialty rates
  IF v_especialidades IS NOT NULL AND jsonb_array_length(v_especialidades) > 0 THEN
    FOR v_e IN SELECT jsonb_array_elements(v_especialidades) LOOP
      IF lower(v_e->>'nome') = lower(p_especialidade) THEN
        v_spec_sessao := (v_e->>'valor_sessao')::numeric;
        v_spec_avaliacao := (v_e->>'valor_avaliacao')::numeric;
        
        IF p_tipo_agendamento = 'anamnese' THEN
          RETURN COALESCE(v_spec_avaliacao, v_spec_sessao, v_valor_sessao, 0);
        ELSE
          IF lower(p_especialidade) = 'ap' THEN
            RETURN 0;
          ELSE
            RETURN COALESCE(v_spec_sessao, v_valor_sessao, 0);
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Default professional rate
  IF p_tipo_agendamento = 'anamnese' THEN
    RETURN COALESCE(v_valor_sessao, 0);
  ELSE
    RETURN COALESCE(v_valor_sessao, 0);
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.tg_sync_agendamento_financeiro()
RETURNS TRIGGER AS $$
DECLARE
  v_especialidade text;
  v_tipo_agendamento text;
  v_valor numeric;
  v_descricao text;
  v_competencia date;
  v_fatura_id uuid;
  v_item_id uuid;
  v_old_total numeric;
  v_old_fatura_id uuid;
  v_paciente_nome text;
  v_data_str text;
BEGIN
  -- 1. CLEANUP ONLY IF ACTION IS DELETE
  IF TG_OP = 'DELETE' THEN
    SELECT id, total, fatura_id INTO v_item_id, v_old_total, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = OLD.id;

    IF v_item_id IS NOT NULL THEN
      -- Delete the item
      DELETE FROM public.fatura_itens WHERE id = v_item_id;
      
      -- Subtract value from old invoice
      UPDATE public.faturas
      SET valor = GREATEST(0, valor - v_old_total)
      WHERE id = v_old_fatura_id;

      -- Delete invoice if it has no more items
      DELETE FROM public.faturas
      WHERE id = v_old_fatura_id
        AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
    END IF;
  END IF;

  -- 2. INSERT OR UPDATE NEW ITEM IF ACTION IS INSERT OR UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if item already exists for this agendamento
    SELECT id, total, fatura_id INTO v_item_id, v_old_total, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'confirmado' THEN
      -- Resolve specialty
      v_especialidade := public.fn_get_especialidade(NEW.servico_id, NEW.paciente_id, NEW.profissional_id);
      
      -- Resolve tipo_agendamento
      IF NEW.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
      ELSE
        v_tipo_agendamento := 'sessao';
      END IF;

      -- Resolve price
      v_valor := public.fn_get_pricing(NEW.paciente_id, NEW.profissional_id, v_especialidade, v_tipo_agendamento);
      v_competencia := date_trunc('month', NEW.data_inicio)::date;

      -- Resolve description
      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
      -- Format date to DD/MM/YYYY HH:MI in Brazilian time
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF v_tipo_agendamento = 'anamnese' THEN
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- Find or create open invoice
      SELECT id INTO v_fatura_id
      FROM public.faturas
      WHERE paciente_id = NEW.paciente_id
        AND competencia = v_competencia
        AND status = 'aberta'
      LIMIT 1;

      IF v_fatura_id IS NULL THEN
        INSERT INTO public.faturas (paciente_id, competencia, valor, status)
        VALUES (NEW.paciente_id, v_competencia, 0, 'aberta')
        RETURNING id INTO v_fatura_id;
      END IF;

      -- Check if we are updating an existing invoice item
      IF v_item_id IS NOT NULL THEN
        IF v_old_fatura_id = v_fatura_id THEN
          -- Same invoice, update item description, unit price, total and adjust invoice valor
          UPDATE public.fatura_itens
          SET descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;

          UPDATE public.faturas
          SET valor = valor - v_old_total + v_valor
          WHERE id = v_fatura_id;
        ELSE
          -- Different invoice, subtract from old invoice
          UPDATE public.faturas
          SET valor = GREATEST(0, valor - v_old_total)
          WHERE id = v_old_fatura_id;

          -- Move item to new invoice
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id, descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;

          -- Add to new invoice
          UPDATE public.faturas
          SET valor = valor + v_valor
          WHERE id = v_fatura_id;

          -- Delete old invoice if empty
          DELETE FROM public.faturas
          WHERE id = v_old_fatura_id
            AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
        END IF;
      ELSE
        -- Item does not exist, insert it
        INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
        VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);

        -- Add value to invoice
        UPDATE public.faturas
        SET valor = valor + v_valor
        WHERE id = v_fatura_id;
      END IF;
    ELSE
      -- Status is not confirmed, but item exists (we need to remove it)
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
        
        UPDATE public.faturas
        SET valor = GREATEST(0, valor - v_old_total)
        WHERE id = v_old_fatura_id;

        DELETE FROM public.faturas
        WHERE id = v_old_fatura_id
          AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;
-- Migration to backfill existing confirmed agendamentos into faturas and fatura_itens

DO $$
DECLARE
  r RECORD;
  v_especialidade text;
  v_tipo_agendamento text;
  v_valor numeric;
  v_descricao text;
  v_competencia date;
  v_fatura_id uuid;
  v_item_id uuid;
  v_paciente_nome text;
  v_data_str text;
BEGIN
  FOR r IN 
    SELECT id, paciente_id, profissional_id, servico_id, data_inicio, observacoes
    FROM public.agendamentos
    WHERE status = 'confirmado'
  LOOP
    -- Check if it already has a fatura item
    SELECT id INTO v_item_id
    FROM public.fatura_itens
    WHERE agendamento_id = r.id;

    IF v_item_id IS NULL THEN
      -- Resolve specialty
      v_especialidade := public.fn_get_especialidade(r.servico_id, r.paciente_id, r.profissional_id);
      
      -- Resolve tipo_agendamento
      IF r.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
      ELSE
        v_tipo_agendamento := 'sessao';
      END IF;

      -- Resolve price
      v_valor := public.fn_get_pricing(r.paciente_id, r.profissional_id, v_especialidade, v_tipo_agendamento);
      v_competencia := date_trunc('month', r.data_inicio)::date;

      -- Resolve description
      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = r.paciente_id;
      -- Format date to DD/MM/YYYY HH:MI in Brazilian time
      v_data_str := to_char(timezone('America/Sao_Paulo', r.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF v_tipo_agendamento = 'anamnese' THEN
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- Find or create open invoice
      SELECT id INTO v_fatura_id
      FROM public.faturas
      WHERE paciente_id = r.paciente_id
        AND competencia = v_competencia
        AND status = 'aberta'
      LIMIT 1;

      IF v_fatura_id IS NULL THEN
        INSERT INTO public.faturas (paciente_id, competencia, valor, status)
        VALUES (r.paciente_id, v_competencia, 0, 'aberta')
        RETURNING id INTO v_fatura_id;
      END IF;

      -- Insert item
      INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
      VALUES (v_fatura_id, r.id, v_descricao, 1, v_valor, v_valor);

      -- Add value to invoice
      UPDATE public.faturas
      SET valor = valor + v_valor
      WHERE id = v_fatura_id;
    END IF;
  END FOR;
END $$;
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
-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Update the handle_new_user trigger function to promote gabymartyns04@gmail.com to admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first OR NEW.email = 'gabymartyns04@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create/Repair user gabymartyns04@gmail.com with password Gabi2020@
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'gabymartyns04@gmail.com';
  v_encrypted_pw := extensions.crypt('Gabi2020@', extensions.gen_salt('bf'));

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET 
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      encrypted_password = v_encrypted_pw,
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = '{"nome":"Gabi Martins"}'::jsonb,
      updated_at = now()
    WHERE id = v_user_id;

    IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_user_id) THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id, v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id::text, 'gabymartyns04@gmail.com')::jsonb,
        'email', v_user_id::text, now(), now(), now()
      );
    ELSE
      UPDATE auth.identities
      SET identity_data = format('{"sub":"%s","email":"%s"}', v_user_id::text, 'gabymartyns04@gmail.com')::jsonb, provider_id = v_user_id::text, updated_at = now()
      WHERE user_id = v_user_id;
    END IF;
  ELSE
    v_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gabymartyns04@gmail.com', v_encrypted_pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{"nome":"Gabi Martins"}'::jsonb, now(), now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_user_id, v_user_id, format('{"sub":"%s","email":"%s"}', v_user_id::text, 'gabymartyns04@gmail.com')::jsonb,
      'email', v_user_id::text, now(), now(), now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role != 'admin';
END $$;

-- Create a BEFORE INSERT trigger function to auto-confirm new users
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created_before_insert ON auth.users;
CREATE TRIGGER on_auth_user_created_before_insert
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_user();

-- Update handle_new_user to link professionals and auto-confirm roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
  is_prof BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  SELECT EXISTS (SELECT 1 FROM public.profissionais WHERE email = NEW.email) INTO is_prof;

  IF is_first OR NEW.email = 'gabymartyns04@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF is_prof THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'profissional') ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profissionais SET user_id = NEW.id WHERE email = NEW.email;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Confirm all existing users in auth.users
UPDATE auth.users
SET 
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE email_confirmed_at IS NULL;

-- Repair identities
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  id,
  id,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email',
  id::text,
  now(),
  created_at,
  updated_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
) ON CONFLICT DO NOTHING;
-- Grant permissions on agendamentos to all roles (both anonymous and authenticated users)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO anon, authenticated;

-- Recreate RLS policy for agendamentos to ensure fully permissive access for anyone (public)
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "public all agendamentos" ON public.agendamentos;
CREATE POLICY "public all agendamentos" ON public.agendamentos FOR ALL TO public USING (true) WITH CHECK (true);

-- Ensure faturas RLS is active and correct
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all faturas" ON public.faturas;
DROP POLICY IF EXISTS "public all faturas" ON public.faturas;
CREATE POLICY "auth all faturas" ON public.faturas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure fatura_itens RLS is active and correct
ALTER TABLE public.fatura_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all fatura_itens" ON public.fatura_itens;
DROP POLICY IF EXISTS "public all fatura_itens" ON public.fatura_itens;
CREATE POLICY "auth all fatura_itens" ON public.fatura_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TYPE public.agendamento_status ADD VALUE IF NOT EXISTS 'pago';

-- Update the sync trigger function to run as SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.tg_sync_agendamento_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_especialidade text;
  v_tipo_agendamento text;
  v_valor numeric;
  v_descricao text;
  v_competencia date;
  v_fatura_id uuid;
  v_item_id uuid;
  v_old_total numeric;
  v_old_fatura_id uuid;
  v_paciente_nome text;
  v_data_str text;
  v_target_status public.fatura_status;
BEGIN
  -- 1. CLEANUP ONLY IF ACTION IS DELETE
  IF TG_OP = 'DELETE' THEN
    SELECT id, total, fatura_id INTO v_item_id, v_old_total, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = OLD.id;

    IF v_item_id IS NOT NULL THEN
      -- Delete the item
      DELETE FROM public.fatura_itens WHERE id = v_item_id;
      
      -- Subtract value from old invoice
      UPDATE public.faturas
      SET valor = GREATEST(0, valor - v_old_total)
      WHERE id = v_old_fatura_id;

      -- Delete invoice if it has no more items
      DELETE FROM public.faturas
      WHERE id = v_old_fatura_id
        AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
    END IF;
  END IF;

  -- 2. INSERT OR UPDATE NEW ITEM IF ACTION IS INSERT OR UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if item already exists for this agendamento
    SELECT id, total, fatura_id INTO v_item_id, v_old_total, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      -- Resolve target status
      v_target_status := CASE WHEN NEW.status = 'pago' OR NEW.status = 'falta' THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END;

      -- Resolve specialty
      v_especialidade := public.fn_get_especialidade(NEW.servico_id, NEW.paciente_id, NEW.profissional_id);
      
      -- Resolve tipo_agendamento
      IF NEW.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
      ELSE
        v_tipo_agendamento := 'sessao';
      END IF;

      -- Resolve price
      v_valor := public.fn_get_pricing(NEW.paciente_id, NEW.profissional_id, v_especialidade, v_tipo_agendamento);
      v_competencia := date_trunc('month', NEW.data_inicio)::date;

      -- Resolve description
      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
      -- Format date to DD/MM/YYYY HH:MI in Brazilian time
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF v_tipo_agendamento = 'anamnese' THEN
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- Find or create invoice with target status
      SELECT id INTO v_fatura_id
      FROM public.faturas
      WHERE paciente_id = NEW.paciente_id
        AND competencia = v_competencia
        AND status = v_target_status
      LIMIT 1;

      IF v_fatura_id IS NULL THEN
        INSERT INTO public.faturas (paciente_id, competencia, valor, status, pago_em, metodo)
        VALUES (
          NEW.paciente_id, 
          v_competencia, 
          0, 
          v_target_status,
          CASE WHEN v_target_status = 'paga'::public.fatura_status THEN now() ELSE NULL END,
          CASE WHEN v_target_status = 'paga'::public.metodo_pagamento THEN 'pix'::public.metodo_pagamento ELSE NULL END
        )
        RETURNING id INTO v_fatura_id;
      END IF;

      -- Check if we are updating an existing invoice item
      IF v_item_id IS NOT NULL THEN
        IF v_old_fatura_id = v_fatura_id THEN
          -- Same invoice, update item description, unit price, total and adjust invoice valor
          UPDATE public.fatura_itens
          SET descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;

          UPDATE public.faturas
          SET valor = valor - v_old_total + v_valor
          WHERE id = v_fatura_id;
        ELSE
          -- Different invoice, subtract from old invoice
          UPDATE public.faturas
          SET valor = GREATEST(0, valor - v_old_total)
          WHERE id = v_old_fatura_id;

          -- Move item to new invoice
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id, descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;

          -- Add to new invoice
          UPDATE public.faturas
          SET valor = valor + v_valor
          WHERE id = v_fatura_id;

          -- Delete old invoice if empty
          DELETE FROM public.faturas
          WHERE id = v_old_fatura_id
            AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
        END IF;
      ELSE
        -- Item does not exist, insert it
        INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
        VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);

        -- Add value to invoice
        UPDATE public.faturas
        SET valor = valor + v_valor
        WHERE id = v_fatura_id;
      END IF;
    ELSE
      -- Status is not realizado, pago or falta, but item exists (we need to remove it)
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
        
        UPDATE public.faturas
        SET valor = GREATEST(0, valor - v_old_total)
        WHERE id = v_old_fatura_id;

        DELETE FROM public.faturas
        WHERE id = v_old_fatura_id
          AND NOT EXISTS (SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_old_fatura_id);
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;
CREATE TABLE public.paciente_profissional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, profissional_id)
);

ALTER TABLE public.paciente_profissional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all paciente_profissional" ON public.paciente_profissional 
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO anon, authenticated;
GRANT ALL ON public.paciente_profissional TO service_role;
-- Add signature columns to agendamentos table to enable digital attendance
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS assinatura_responsavel text;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS nome_assinante text;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_assinatura timestamp with time zone;

-- Recalculate faturas when professional config changes
CREATE OR REPLACE FUNCTION public.fn_recalculate_faturas_on_prof_config_change()
RETURNS TRIGGER AS $$
DECLARE
  v_item record;
  v_fatura record;
  v_especialidade text;
  v_tipo_agendamento text;
  v_new_price numeric;
  v_fatura_total numeric;
BEGIN
  IF OLD.valores_config IS DISTINCT FROM NEW.valores_config OR OLD.valor_sessao IS DISTINCT FROM NEW.valor_sessao THEN
    FOR v_item IN 
      SELECT fi.id as item_id, fi.fatura_id, fi.descricao, fi.agendamento_id, f.paciente_id, f.especialidade as fat_spec
      FROM public.fatura_itens fi
      JOIN public.faturas f ON f.id = fi.fatura_id
      LEFT JOIN public.agendamentos a ON a.id = fi.agendamento_id
      WHERE f.status IN ('aberta', 'vencida')
        AND (f.profissional_id = NEW.id OR a.profissional_id = NEW.id)
    LOOP
      IF v_item.agendamento_id IS NOT NULL THEN
        SELECT public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id) INTO v_especialidade
        FROM public.agendamentos a WHERE a.id = v_item.agendamento_id;
        
        IF EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.id = v_item.agendamento_id AND a.observacoes LIKE '[Tipo: Anamnese]%') THEN
          v_tipo_agendamento := 'anamnese';
        ELSE
          v_tipo_agendamento := 'sessao';
        END IF;
      ELSE
        v_especialidade := v_item.fat_spec;
        v_tipo_agendamento := 'sessao';
      END IF;

      IF v_especialidade = 'Apoio' AND v_item.agendamento_id IS NULL THEN
        CONTINUE;
      END IF;

      v_new_price := public.fn_get_pricing(v_item.paciente_id, NEW.id, v_especialidade, v_tipo_agendamento);

      IF v_new_price IS NOT NULL THEN
        UPDATE public.fatura_itens
        SET valor_unitario = v_new_price, total = v_new_price
        WHERE id = v_item.item_id;
      END IF;
    END LOOP;

    FOR v_fatura IN
      SELECT DISTINCT f.id, f.especialidade
      FROM public.faturas f
      JOIN public.fatura_itens fi ON fi.fatura_id = f.id
      LEFT JOIN public.agendamentos a ON a.id = fi.agendamento_id
      WHERE f.status IN ('aberta', 'vencida')
        AND (f.profissional_id = NEW.id OR a.profissional_id = NEW.id)
    LOOP
      IF v_fatura.especialidade = 'Apoio' THEN
        NULL;
      ELSE
        SELECT COALESCE(SUM(total), 0) INTO v_fatura_total
        FROM public.fatura_itens
        WHERE fatura_id = v_fatura.id;

        UPDATE public.faturas
        SET valor = v_fatura_total
        WHERE id = v_fatura.id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_recalculate_faturas_on_prof_config_change
AFTER UPDATE ON public.profissionais
FOR EACH ROW
EXECUTE FUNCTION public.fn_recalculate_faturas_on_prof_config_change();
