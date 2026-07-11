-- Migration to update fn_recalculate_apoio_package so that Apoio packages are billed flat monthly
-- even if no sessions are completed yet or if sessions are pending.

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
  v_is_apoio boolean;
  v_has_realized_sessions boolean;
  v_target_prof_id uuid;
BEGIN
  -- 1. Check if patient is configured as Apoio (has 'Apoio' or 'AP' in cids_secundarios)
  SELECT (
    cids_secundarios IS NOT NULL AND (
      'Apoio' = ANY(cids_secundarios) OR 'AP' = ANY(cids_secundarios)
    )
  ), apoio_frequencia, apoio_valor_personalizado
  INTO v_is_apoio, v_apoio_frequencia, v_apoio_valor_personalizado
  FROM public.pacientes
  WHERE id = p_paciente_id;

  -- Check if there are any billable 'Apoio' sessions in status realizado, pago, falta
  SELECT EXISTS (
    SELECT 1
    FROM public.agendamentos a
    WHERE a.paciente_id = p_paciente_id
      AND date_trunc('month', a.data_inicio)::date = p_competencia
      AND a.status IN ('realizado', 'pago', 'falta')
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
  ) INTO v_has_realized_sessions;

  -- An Apoio patient gets a package invoice if they have completed/missed sessions, OR if they are on a fixed monthly package (not avulso)
  v_has_sessions := COALESCE(v_has_realized_sessions, false) 
    OR (COALESCE(v_is_apoio, false) AND COALESCE(v_apoio_frequencia, 'avulso') <> 'avulso');

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

  -- 4. Get Apoio configuration
  v_apoio_frequencia := COALESCE(v_apoio_frequencia, 'avulso');

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

    -- Get patient's first professional
    SELECT profissional_id INTO v_target_prof_id
    FROM public.paciente_profissional
    WHERE paciente_id = p_paciente_id
    LIMIT 1;

    INSERT INTO public.faturas (paciente_id, competencia, valor, status, especialidade, profissional_id, pago_em, metodo)
    VALUES (
      p_paciente_id, 
      p_competencia, 
      v_package_valor, 
      v_target_status, 
      'Apoio',
      v_target_prof_id,
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
