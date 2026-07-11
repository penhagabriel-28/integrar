-- Migration to automatically detect cash (dinheiro) payments from appointment observations

-- 1. Update fn_recalculate_apoio_package to check for cash keyword in sessions
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
  
  v_apoio_frequencia text;
  v_apoio_valor_personalizado numeric;
  v_session_count integer;
  v_is_apoio boolean;
  v_has_realized_sessions boolean;
  v_target_prof_id uuid;
  v_metodo public.metodo_pagamento;
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
      DELETE FROM public.fatura_itens 
      WHERE fatura_id = v_fatura_id 
        AND agendamento_id IS NULL 
        AND (descricao LIKE 'Pacote Apoio%' OR descricao = 'Pacote Apoio');
      
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

  -- Resolve status based on session statuses: if any session is 'pago', we make it 'paga', otherwise 'aberta'
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = p_paciente_id
      AND date_trunc('month', a.data_inicio)::date = p_competencia
      AND a.status = 'pago'
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
  ) THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END INTO v_target_status;

  -- Resolve payment method for Apoio based on session observations
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = p_paciente_id
      AND date_trunc('month', a.data_inicio)::date = p_competencia
      AND a.status = 'pago'
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
      AND a.observacoes IS NOT NULL
      AND (
        lower(a.observacoes) LIKE '%dinheiro%' OR 
        lower(a.observacoes) LIKE '%espécie%' OR 
        lower(a.observacoes) LIKE '%especie%' OR 
        lower(a.observacoes) LIKE '%espã©cie%'
      )
  ) THEN 'dinheiro'::public.metodo_pagamento ELSE 'pix'::public.metodo_pagamento END INTO v_metodo;

  -- 6. Insert or update invoice
  IF v_fatura_id IS NULL THEN
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
      CASE WHEN v_target_status = 'paga' THEN v_metodo ELSE NULL END
    )
    RETURNING id INTO v_fatura_id;
  ELSE
    UPDATE public.faturas
    SET status = v_target_status,
        pago_em = CASE WHEN v_target_status = 'paga' THEN COALESCE(pago_em, p_competencia::timestamp) ELSE NULL END,
        metodo = CASE WHEN v_target_status = 'paga' THEN v_metodo ELSE NULL END
    WHERE id = v_fatura_id;
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

  -- 8. Ensure all 'Apoio' session items are linked
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


-- 2. Update tg_sync_agendamento_financeiro to parse payment method
CREATE OR REPLACE FUNCTION public.tg_sync_agendamento_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_especialidade text;
  v_old_especialidade text;
  v_tipo_agendamento text;
  v_valor numeric;
  v_descricao text;
  v_competencia date;
  v_old_competencia date;
  v_fatura_id uuid;
  v_item_id uuid;
  v_old_fatura_id uuid;
  v_paciente_nome text;
  v_data_str text;
  v_target_status public.fatura_status;
  v_metodo public.metodo_pagamento;
BEGIN
  -- A. CLEANUP ONLY IF ACTION IS DELETE
  IF TG_OP = 'DELETE' THEN
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = OLD.id;

    IF v_item_id IS NOT NULL THEN
      DELETE FROM public.fatura_itens WHERE id = v_item_id;
    END IF;

    v_old_especialidade := public.fn_get_especialidade(OLD.servico_id, OLD.paciente_id, OLD.profissional_id);
    v_old_competencia := date_trunc('month', OLD.data_inicio)::date;

    IF lower(v_old_especialidade) = 'apoio' THEN
      PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
    ELSE
      IF v_old_fatura_id IS NOT NULL THEN
        DELETE FROM public.faturas f
        WHERE f.id = v_old_fatura_id
          AND NOT EXISTS (
            SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
          );
      END IF;
    END IF;
  END IF;

  -- B. INSERT OR UPDATE NEW ITEM IF ACTION IS INSERT OR UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_especialidade := public.fn_get_especialidade(NEW.servico_id, NEW.paciente_id, NEW.profissional_id);
    IF TG_OP = 'UPDATE' THEN
      v_old_especialidade := public.fn_get_especialidade(OLD.servico_id, OLD.paciente_id, OLD.profissional_id);
      v_old_competencia := date_trunc('month', OLD.data_inicio)::date;
    END IF;

    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      v_target_status := CASE WHEN NEW.status = 'pago' THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END;
      v_competencia := date_trunc('month', NEW.data_inicio)::date;

      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF NEW.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_tipo_agendamento := 'sessao';
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- Resolve payment method
      v_metodo := 'pix'::public.metodo_pagamento;
      IF NEW.observacoes IS NOT NULL AND (
         lower(NEW.observacoes) LIKE '%dinheiro%' OR 
         lower(NEW.observacoes) LIKE '%espécie%' OR 
         lower(NEW.observacoes) LIKE '%especie%' OR 
         lower(NEW.observacoes) LIKE '%espã©cie%'
      ) THEN
        v_metodo := 'dinheiro'::public.metodo_pagamento;
      END IF;

      -- CASE 1: SPECIALTY IS APOIO
      IF lower(v_especialidade) = 'apoio' THEN
        SELECT id INTO v_fatura_id
        FROM public.faturas
        WHERE paciente_id = NEW.paciente_id
          AND competencia = v_competencia
          AND especialidade = 'Apoio'
        LIMIT 1;

        IF v_fatura_id IS NULL THEN
          INSERT INTO public.faturas (paciente_id, competencia, valor, status, especialidade)
          VALUES (NEW.paciente_id, v_competencia, 0, 'aberta', 'Apoio')
          RETURNING id INTO v_fatura_id;
        END IF;

        IF v_item_id IS NOT NULL THEN
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id,
              descricao = v_descricao,
              valor_unitario = 0,
              total = 0
          WHERE id = v_item_id;
        ELSE
          INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
          VALUES (v_fatura_id, NEW.id, v_descricao, 1, 0, 0);
        END IF;

        PERFORM public.fn_recalculate_apoio_package(NEW.paciente_id, v_competencia);

        IF TG_OP = 'UPDATE' AND (OLD.paciente_id <> NEW.paciente_id OR v_old_competencia <> v_competencia OR lower(v_old_especialidade) <> 'apoio') THEN
          IF lower(v_old_especialidade) = 'apoio' THEN
            PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
          END IF;
        END IF;

      -- CASE 2: SPECIALTY IS NOT APOIO
      ELSE
        v_valor := public.fn_get_pricing(NEW.paciente_id, NEW.profissional_id, v_especialidade, v_tipo_agendamento);

        IF v_item_id IS NOT NULL THEN
          v_fatura_id := v_old_fatura_id;
          
          UPDATE public.faturas
          SET status = v_target_status,
              pago_em = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
              metodo = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN v_metodo ELSE NULL END,
              especialidade = v_especialidade,
              profissional_id = NEW.profissional_id
          WHERE id = v_fatura_id;
        ELSE
          INSERT INTO public.faturas (paciente_id, competencia, valor, status, pago_em, metodo, especialidade, profissional_id)
          -- Note: the original column spelling is profissional_id
          VALUES (
            NEW.paciente_id, 
            v_competencia, 
            0, 
            v_target_status,
            CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
            CASE WHEN v_target_status = 'paga'::public.fatura_status THEN v_metodo ELSE NULL END,
            v_especialidade,
            NEW.profissional_id
          )
          RETURNING id INTO v_fatura_id;
        END IF;

        IF v_item_id IS NOT NULL THEN
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id,
              descricao = v_descricao,
              valor_unitario = v_valor,
              total = v_valor
          WHERE id = v_item_id;
        ELSE
          INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
          VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);
        END IF;

        IF TG_OP = 'UPDATE' AND lower(v_old_especialidade) = 'apoio' THEN
          PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
        END IF;
      END IF;

    ELSE
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
        
        IF lower(v_especialidade) = 'apoio' THEN
          PERFORM public.fn_recalculate_apoio_package(NEW.paciente_id, date_trunc('month', NEW.data_inicio)::date);
        ELSE
          IF v_old_fatura_id IS NOT NULL THEN
            DELETE FROM public.faturas f
            WHERE f.id = v_old_fatura_id
              AND NOT EXISTS (
                SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
              );
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- 3. Backfill/Scan and update all existing paid faturas to recognize cash payments
-- Update non-Apoio faturas
UPDATE public.faturas f
SET metodo = 'dinheiro'::public.metodo_pagamento
WHERE f.status = 'paga'
  AND f.metodo = 'pix'::public.metodo_pagamento
  AND EXISTS (
    SELECT 1 
    FROM public.fatura_itens fi
    JOIN public.agendamentos a ON fi.agendamento_id = a.id
    WHERE fi.fatura_id = f.id
      AND a.observacoes IS NOT NULL
      AND (
        lower(a.observacoes) LIKE '%dinheiro%' OR 
        lower(a.observacoes) LIKE '%espécie%' OR 
        lower(a.observacoes) LIKE '%especie%' OR 
        lower(a.observacoes) LIKE '%espã©cie%'
      )
  );

-- Update Apoio faturas
UPDATE public.faturas f
SET metodo = 'dinheiro'::public.metodo_pagamento
WHERE f.status = 'paga'
  AND f.metodo = 'pix'::public.metodo_pagamento
  AND f.especialidade = 'Apoio'
  AND EXISTS (
    SELECT 1 
    FROM public.agendamentos a
    WHERE a.paciente_id = f.paciente_id
      AND date_trunc('month', a.data_inicio)::date = f.competencia
      AND a.status = 'pago'
      AND a.observacoes IS NOT NULL
      AND (
        lower(a.observacoes) LIKE '%dinheiro%' OR 
        lower(a.observacoes) LIKE '%espécie%' OR 
        lower(a.observacoes) LIKE '%especie%' OR 
        lower(a.observacoes) LIKE '%espã©cie%'
      )
  );
