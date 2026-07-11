-- 1. Alter table public.pacientes to add Apoio frequency and custom price/discount
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_frequencia TEXT DEFAULT 'avulso';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS apoio_valor_personalizado NUMERIC;

-- Comment on columns
COMMENT ON COLUMN public.pacientes.apoio_frequencia IS 'Frequência do aluno no Apoio: avulso, 1x, 2x, 3x, semana_toda';
COMMENT ON COLUMN public.pacientes.apoio_valor_personalizado IS 'Valor personalizado (desconto) para o Apoio: mensal se pacote, ou por sessão se avulso';


-- 2. Update existing Apoio patients to ensure they default to 'avulso' if NULL
UPDATE public.pacientes 
SET apoio_frequencia = 'avulso' 
WHERE apoio_frequencia IS NULL;


-- 3. Recreate the function public.fn_recalculate_apoio_package to support the new rules
CREATE OR REPLACE FUNCTION public.fn_recalculate_apoio_package(
  p_paciente_id uuid,
  p_competencia date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_weekly_freq integer;
  v_package_valor numeric;
  v_package_desc text;
  v_fatura_id uuid;
  v_item_id uuid;
  v_has_sessions boolean;
  v_target_status public.fatura_status;
  
  -- New variables
  v_apoio_frequencia text;
  v_apoio_valor_personalizado numeric;
  v_session_count integer;
BEGIN
  -- 1. Check if there are any billable 'Apoio' sessions for this patient in this month
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.paciente_id = p_paciente_id
      AND date_trunc('month', a.data_inicio)::date = p_competencia
      AND a.status IN ('realizado', 'pago', 'falta')
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
  ) INTO v_has_sessions;

  -- 2. Find the consolidated Apoio invoice for this patient and month
  SELECT id INTO v_fatura_id
  FROM public.faturas
  WHERE paciente_id = p_paciente_id
    AND competencia = p_competencia
    AND especialidade = 'Apoio'
  LIMIT 1;

  -- 3. If there are no sessions, we clean up the package item and the invoice
  IF NOT v_has_sessions THEN
    IF v_fatura_id IS NOT NULL THEN
      -- Delete the package fee item
      DELETE FROM public.fatura_itens 
      WHERE fatura_id = v_fatura_id 
        AND agendamento_id IS NULL 
        AND (descricao LIKE 'Pacote Apoio%' OR descricao = 'Pacote Apoio');
      
      -- Delete the invoice if it has no more items
      DELETE FROM public.faturas f
      WHERE f.id = v_fatura_id
        AND NOT EXISTS (
          SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
        );
    END IF;
    RETURN;
  END IF;

  -- 4. Get patient's configuration
  SELECT COALESCE(apoio_frequencia, 'avulso'), apoio_valor_personalizado
  INTO v_apoio_frequencia, v_apoio_valor_personalizado
  FROM public.pacientes
  WHERE id = p_paciente_id;

  -- 5. Calculate price based on selected frequency
  IF v_apoio_frequencia = '1x' THEN
    v_package_valor := COALESCE(v_apoio_valor_personalizado, 120.00);
    v_package_desc := 'Pacote Apoio - 1x por semana';
  ELSIF v_apoio_frequencia = '2x' THEN
    v_package_valor := COALESCE(v_apoio_valor_personalizado, 240.00);
    v_package_desc := 'Pacote Apoio - 2x por semana';
  ELSIF v_apoio_frequencia = '3x' THEN
    v_package_valor := COALESCE(v_apoio_valor_personalizado, 360.00);
    v_package_desc := 'Pacote Apoio - 3x por semana';
  ELSIF v_apoio_frequencia = 'semana_toda' THEN
    v_package_valor := COALESCE(v_apoio_valor_personalizado, 450.00);
    v_package_desc := 'Pacote Apoio - Semana Inteira';
  ELSIF v_apoio_frequencia = 'avulso' THEN
    -- Sessão avulsa = R$ 50.00 per session
    SELECT COUNT(*)
    INTO v_session_count
    FROM public.agendamentos a
    WHERE a.paciente_id = p_paciente_id
      AND date_trunc('month', a.data_inicio)::date = p_competencia
      AND a.status IN ('realizado', 'pago', 'falta')
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio';

    v_package_valor := v_session_count * COALESCE(v_apoio_valor_personalizado, 50.00);
    v_package_desc := 'Pacote Apoio - Sessões Avulsas (' || v_session_count || ' sessões)';
  ELSE
    -- Fallback to old dynamic count logic based on maximum weekly sessions (in case of undefined values)
    SELECT COALESCE(MAX(weekly_count), 0)
    INTO v_max_weekly_freq
    FROM (
      SELECT count(*) as weekly_count
      FROM public.agendamentos a
      WHERE a.paciente_id = p_paciente_id
        AND date_trunc('month', a.data_inicio)::date = p_competencia
        AND a.status IN ('realizado', 'pago', 'falta')
        AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
      GROUP BY date_trunc('week', a.data_inicio)
    ) sub;

    IF v_max_weekly_freq = 1 THEN
      v_package_valor := 120.00;
      v_package_desc := 'Pacote Apoio - 1x por semana';
    ELSIF v_max_weekly_freq = 2 THEN
      v_package_valor := 240.00;
      v_package_desc := 'Pacote Apoio - 2x por semana';
    ELSIF v_max_weekly_freq = 3 THEN
      v_package_valor := 360.00;
      v_package_desc := 'Pacote Apoio - 3x por semana';
    ELSIF v_max_weekly_freq >= 4 THEN
      v_package_valor := 450.00;
      v_package_desc := 'Pacote Apoio - Semana Inteira';
    ELSE
      v_package_valor := 0;
      v_package_desc := 'Pacote Apoio';
    END IF;
  END IF;

  -- 6. If no invoice exists, create one
  IF v_fatura_id IS NULL THEN
    -- Resolve status based on session statuses: if any session is 'pago', we make it 'paga', otherwise 'aberta'
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p_paciente_id
        AND date_trunc('month', a.data_inicio)::date = p_competencia
        AND a.status = 'pago'
        AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
    ) THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END INTO v_target_status;

    INSERT INTO public.faturas (paciente_id, competencia, valor, status, especialidade, pago_em, metodo)
    VALUES (
      p_paciente_id, 
      p_competencia, 
      v_package_valor, 
      v_target_status, 
      'Apoio',
      CASE WHEN v_target_status = 'paga' THEN p_competencia::timestamp ELSE NULL END,
      CASE WHEN v_target_status = 'paga' THEN 'pix'::public.metodo_pagamento ELSE NULL END
    )
    RETURNING id INTO v_fatura_id;
  END IF;

  -- 7. Update or insert the package fee item
  SELECT id INTO v_item_id
  FROM public.fatura_itens
  WHERE fatura_id = v_fatura_id
    AND agendamento_id IS NULL
    AND (descricao LIKE 'Pacote Apoio%' OR descricao = 'Pacote Apoio')
  LIMIT 1;

  IF v_item_id IS NOT NULL THEN
    UPDATE public.fatura_itens
    SET descricao = v_package_desc,
        valor_unitario = v_package_valor,
        total = v_package_valor
    WHERE id = v_item_id;
  ELSE
    INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
    VALUES (v_fatura_id, NULL, v_package_desc, 1, v_package_valor, v_package_valor);
  END IF;

  -- 8. Ensure all 'Apoio' session items for this patient and month are linked to this invoice and have value 0
  UPDATE public.fatura_itens fi
  SET fatura_id = v_fatura_id,
      valor_unitario = 0,
      total = 0
  FROM public.agendamentos a
  WHERE fi.agendamento_id = a.id
    AND a.paciente_id = p_paciente_id
    AND date_trunc('month', a.data_inicio)::date = p_competencia
    AND a.status IN ('realizado', 'pago', 'falta')
    AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio';

  -- 9. Recalculate fatura total
  UPDATE public.faturas
  SET valor = COALESCE((
    SELECT SUM(total)
    FROM public.fatura_itens
    WHERE fatura_id = v_fatura_id
  ), 0)
  WHERE id = v_fatura_id;

END;
$$;
