
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
