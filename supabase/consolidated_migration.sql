-- ============ ENUMS ============
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'recepcionista', 'profissional');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'paciente_status') THEN
        CREATE TYPE public.paciente_status AS ENUM ('ativo', 'inativo', 'lista_espera');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_atendimento') THEN
        CREATE TYPE public.tipo_atendimento AS ENUM ('particular', 'convenio');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agendamento_status') THEN
        CREATE TYPE public.agendamento_status AS ENUM ('pendente', 'confirmado', 'cancelado', 'realizado', 'falta');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recorrencia_tipo') THEN
        CREATE TYPE public.recorrencia_tipo AS ENUM ('unica', 'semanal', 'quinzenal', 'mensal');
    END IF;
END $$;

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "user updates own profile" ON public.profiles;
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- ============ USER ROLES ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated, anon;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read user_roles" ON public.user_roles;
CREATE POLICY "auth read user_roles" ON public.user_roles FOR SELECT TO authenticated, anon USING (true);

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
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ PROFISSIONAIS ============
CREATE TABLE IF NOT EXISTS public.profissionais (
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
  valores_config JSONB DEFAULT '{"especialidades": [], "descontos": []}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profissionais ADD COLUMN IF NOT EXISTS valores_config JSONB DEFAULT '{"especialidades": [], "descontos": []}'::jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO authenticated, anon;
GRANT ALL ON public.profissionais TO service_role;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all profissionais" ON public.profissionais;
DROP POLICY IF EXISTS "public all profissionais" ON public.profissionais;
CREATE POLICY "public all profissionais" ON public.profissionais FOR ALL TO public USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_prof_upd ON public.profissionais;
CREATE TRIGGER trg_prof_upd BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SERVICOS ============
CREATE TABLE IF NOT EXISTS public.servicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL DEFAULT 50,
  cor TEXT NOT NULL DEFAULT '#fb923c',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated, anon;
GRANT ALL ON public.servicos TO service_role;
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all servicos" ON public.servicos;
DROP POLICY IF EXISTS "public all servicos" ON public.servicos;
CREATE POLICY "public all servicos" ON public.servicos FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO public.servicos (nome, duracao_minutos) VALUES
  ('ABA', 60), ('Fonoaudiologia', 45), ('Psicologia', 50),
  ('Terapia Ocupacional', 50), ('Psicopedagogia', 50)
ON CONFLICT DO NOTHING;

-- ============ SALAS ============
CREATE TABLE IF NOT EXISTS public.salas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO authenticated, anon;
GRANT ALL ON public.salas TO service_role;
ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all salas" ON public.salas;
DROP POLICY IF EXISTS "public all salas" ON public.salas;
CREATE POLICY "public all salas" ON public.salas FOR ALL TO public USING (true) WITH CHECK (true);

INSERT INTO public.salas (nome) VALUES ('Sala 1'), ('Sala 2'), ('Sala 3') ON CONFLICT DO NOTHING;

-- ============ PACIENTES ============
CREATE TABLE IF NOT EXISTS public.pacientes (
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
  apoio_frequencia TEXT DEFAULT 'avulso',
  apoio_valor_personalizado NUMERIC(10,2),
  cpf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_frequencia TEXT DEFAULT 'avulso';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_valor_personalizado NUMERIC(10,2);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cpf TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated, anon;
GRANT ALL ON public.pacientes TO service_role;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "public all pacientes" ON public.pacientes;
CREATE POLICY "public all pacientes" ON public.pacientes FOR ALL TO public USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_pac_upd ON public.pacientes;
CREATE TRIGGER trg_pac_upd BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RESPONSAVEIS ============
CREATE TABLE IF NOT EXISTS public.responsaveis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  parentesco TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO authenticated, anon;
GRANT ALL ON public.responsaveis TO service_role;
ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all responsaveis" ON public.responsaveis;
DROP POLICY IF EXISTS "public all responsaveis" ON public.responsaveis;
CREATE POLICY "public all responsaveis" ON public.responsaveis FOR ALL TO public USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_resp_paciente ON public.responsaveis(paciente_id);

-- ============ AGENDAMENTOS ============
CREATE TABLE IF NOT EXISTS public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
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
  assinatura_responsavel TEXT,
  nome_assinante TEXT,
  data_assinatura TIMESTAMPTZ,
  plano_aba JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS assinatura_responsavel TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS nome_assinante TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_assinatura TIMESTAMPTZ;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS plano_aba JSONB;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated, anon;
GRANT ALL ON public.agendamentos TO service_role;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "public all agendamentos" ON public.agendamentos;
CREATE POLICY "public all agendamentos" ON public.agendamentos FOR ALL TO public USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_ag_upd ON public.agendamentos;
CREATE TRIGGER trg_ag_upd BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_ag_inicio ON public.agendamentos(data_inicio);
CREATE INDEX IF NOT EXISTS idx_ag_profissional ON public.agendamentos(profissional_id);
CREATE INDEX IF NOT EXISTS idx_ag_paciente ON public.agendamentos(paciente_id);

-- Ensure Foreign Key on agendamentos is ON DELETE CASCADE for profissionais
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_profissional_id_fkey;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES public.profissionais(id) ON DELETE CASCADE;

-- ============ BLOQUEIOS ============
CREATE TABLE IF NOT EXISTS public.bloqueios_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE CASCADE,
  data_inicio TIMESTAMPTZ NOT NULL,
  data_fim TIMESTAMPTZ NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bloqueios_agenda TO authenticated, anon;
GRANT ALL ON public.bloqueios_agenda TO service_role;
ALTER TABLE public.bloqueios_agenda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all bloqueios" ON public.bloqueios_agenda;
DROP POLICY IF EXISTS "public all bloqueios" ON public.bloqueios_agenda;
CREATE POLICY "public all bloqueios" ON public.bloqueios_agenda FOR ALL TO public USING (true) WITH CHECK (true);

-- ============ FATURAS & FATURA ITENS ============
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fatura_status') THEN
        CREATE TYPE public.fatura_status AS ENUM ('aberta','paga','vencida','cancelada');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metodo_pagamento') THEN
        CREATE TYPE public.metodo_pagamento AS ENUM ('pix','dinheiro','cartao_credito','cartao_debito','transferencia','boleto','convenio','outro');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL,
  profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL,
  especialidade text,
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
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS especialidade text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturas TO authenticated, anon;
GRANT ALL ON public.faturas TO service_role;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all faturas" ON public.faturas;
DROP POLICY IF EXISTS "public all faturas" ON public.faturas;
CREATE POLICY "public all faturas" ON public.faturas FOR ALL TO public USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.fatura_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade integer NOT NULL DEFAULT 1,
  valor_unitario numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_itens TO authenticated, anon;
GRANT ALL ON public.fatura_itens TO service_role;
ALTER TABLE public.fatura_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all fatura_itens" ON public.fatura_itens;
DROP POLICY IF EXISTS "public all fatura_itens" ON public.fatura_itens;
CREATE POLICY "public all fatura_itens" ON public.fatura_itens FOR ALL TO public USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS faturas_updated_at ON public.faturas;
CREATE TRIGGER faturas_updated_at BEFORE UPDATE ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_faturas_paciente ON public.faturas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_faturas_status ON public.faturas(status);
CREATE INDEX IF NOT EXISTS idx_fatura_itens_fatura ON public.fatura_itens(fatura_id);

-- ============ PACIENTE_PROFISSIONAL ============
CREATE TABLE IF NOT EXISTS public.paciente_profissional (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  profissional_id uuid NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paciente_id, profissional_id)
);

ALTER TABLE public.paciente_profissional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all paciente_profissional" ON public.paciente_profissional;
CREATE POLICY "public all paciente_profissional" ON public.paciente_profissional 
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO anon, authenticated;
GRANT ALL ON public.paciente_profissional TO service_role;

-- ============ ANAMNESES ============
CREATE TABLE IF NOT EXISTS public.anamneses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE CASCADE NOT NULL,
  agendamento_id UUID REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  respostas JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.anamneses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all anamneses" ON public.anamneses;
CREATE POLICY "public all anamneses" ON public.anamneses FOR ALL TO public USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_anamneses_upd ON public.anamneses;
CREATE TRIGGER trg_anamneses_upd BEFORE UPDATE ON public.anamneses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO anon, authenticated;
GRANT ALL ON public.anamneses TO service_role;

-- ============ TIPOS DE DOCUMENTO ============
CREATE TABLE IF NOT EXISTS public.tipos_documento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all tipos_documento" ON public.tipos_documento;
CREATE POLICY "public all tipos_documento" ON public.tipos_documento FOR ALL TO public USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento TO anon, authenticated;
GRANT ALL ON public.tipos_documento TO service_role;

INSERT INTO public.tipos_documento (nome) VALUES 
  ('Relatório de Evolução'),
  ('Declaração'),
  ('Nota Fiscal'),
  ('Ficha de Anamnese')
ON CONFLICT (nome) DO NOTHING;

-- ============ CONTROLE DE RELATÓRIOS ============
CREATE TABLE IF NOT EXISTS public.controle_relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID REFERENCES public.pacientes(id) ON DELETE CASCADE NOT NULL,
  profissional_id UUID REFERENCES public.profissionais(id) ON DELETE SET NULL,
  tipo_documento_id UUID REFERENCES public.tipos_documento(id) ON DELETE SET NULL,
  responsavel_nome TEXT NOT NULL,
  responsavel_cpf TEXT,
  valor_total NUMERIC(10,2),
  especialidades TEXT,
  data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_limite DATE NOT NULL,
  data_entrega DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.controle_relatorios ADD COLUMN IF NOT EXISTS responsavel_cpf TEXT;
ALTER TABLE public.controle_relatorios ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2);
ALTER TABLE public.controle_relatorios ADD COLUMN IF NOT EXISTS especialidades TEXT;

ALTER TABLE public.controle_relatorios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public all controle_relatorios" ON public.controle_relatorios;
CREATE POLICY "public all controle_relatorios" ON public.controle_relatorios FOR ALL TO public USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_relatorios TO anon, authenticated;
GRANT ALL ON public.controle_relatorios TO service_role;
DROP TRIGGER IF EXISTS trg_controle_relatorios_upd ON public.controle_relatorios;
CREATE TRIGGER trg_controle_relatorios_upd BEFORE UPDATE ON public.controle_relatorios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RECALCULATE PRICING & SYNC FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.fn_get_especialidade(
  p_servico_id uuid,
  p_paciente_id uuid,
  p_profissional_id uuid
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_servico_nome text;
  v_pac_cids text[];
  v_prof_especialidade text;
  v_prof_specs text[];
  v_spec text;
  v_ps text;
BEGIN
  IF p_servico_id IS NOT NULL THEN
    SELECT nome INTO v_servico_nome FROM public.servicos WHERE id = p_servico_id;
    IF v_servico_nome IS NOT NULL THEN
      RETURN v_servico_nome;
    END IF;
  END IF;

  SELECT cids_secundarios INTO v_pac_cids FROM public.pacientes WHERE id = p_paciente_id;
  SELECT especialidade INTO v_prof_especialidade FROM public.profissionais WHERE id = p_profissional_id;
  
  IF v_prof_especialidade IS NOT NULL AND v_prof_especialidade <> '' THEN
    SELECT array_agg(trim(s)) INTO v_prof_specs
    FROM unnest(string_to_array(v_prof_especialidade, ',')) s
    WHERE trim(s) <> '';
  END IF;

  IF v_pac_cids IS NOT NULL AND array_length(v_pac_cids, 1) > 0 AND v_prof_specs IS NOT NULL AND array_length(v_prof_specs, 1) > 0 THEN
    FOREACH v_spec IN ARRAY v_pac_cids LOOP
      FOREACH v_ps IN ARRAY v_prof_specs LOOP
        IF lower(v_spec) = lower(v_ps) THEN
          RETURN v_spec;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF v_prof_specs IS NOT NULL AND array_length(v_prof_specs, 1) > 0 THEN
    RETURN v_prof_specs[1];
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_pricing(
  p_paciente_id uuid,
  p_profissional_id uuid,
  p_especialidade text,
  p_tipo_agendamento text
) RETURNS numeric
LANGUAGE plpgsql AS $$
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
  SELECT valor_sessao, valores_config INTO v_valor_sessao, v_valores_config
  FROM public.profissionais
  WHERE id = p_profissional_id;

  IF v_valores_config IS NOT NULL THEN
    v_descontos := v_valores_config->'descontos';
    v_especialidades := v_valores_config->'especialidades';
  END IF;

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

  IF p_tipo_agendamento = 'anamnese' THEN
    RETURN COALESCE(v_valor_sessao, 0);
  ELSE
    RETURN COALESCE(v_valor_sessao, 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_agendamento_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_especialidade text;
  v_tipo_agendamento text;
  v_valor numeric;
  v_descricao text;
  v_competencia date;
  v_fatura_id uuid;
  v_item_id uuid;
  v_old_fatura_id uuid;
  v_paciente_nome text;
  v_data_str text;
  v_target_status public.fatura_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.fatura_itens WHERE agendamento_id = OLD.id;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      v_target_status := CASE WHEN NEW.status = 'pago' THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END;

      v_especialidade := public.fn_get_especialidade(NEW.servico_id, NEW.paciente_id, NEW.profissional_id);
      
      IF NEW.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
      ELSE
        v_tipo_agendamento := 'sessao';
      END IF;

      v_valor := public.fn_get_pricing(NEW.paciente_id, NEW.profissional_id, v_especialidade, v_tipo_agendamento);
      v_competencia := date_trunc('month', NEW.data_inicio)::date;

      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF v_tipo_agendamento = 'anamnese' THEN
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

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
          CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
          CASE WHEN v_target_status = 'paga'::public.fatura_status THEN 'pix'::public.metodo_pagamento ELSE NULL END
        )
        RETURNING id INTO v_fatura_id;
      END IF;

      IF v_item_id IS NOT NULL THEN
        IF v_old_fatura_id = v_fatura_id THEN
          UPDATE public.fatura_itens
          SET descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;
        ELSE
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id, descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;
        END IF;
      ELSE
        INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
        VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);
      END IF;
    ELSE
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agendamento_financeiro ON public.agendamentos;
CREATE TRIGGER trg_sync_agendamento_financeiro
  AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_agendamento_financeiro();
