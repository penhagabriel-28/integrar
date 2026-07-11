-- Migration to recreate tg_sync_agendamento_financeiro to support monthly packages for 'Apoio' specialty,
-- and manage Apoio packages dynamically.

-- 1. Helper function to calculate the package price based on weekly frequency and update the consolidated invoice
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

  -- 4. Calculate maximum weekly frequency of billable 'Apoio' sessions
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

  -- Map to price
  IF v_max_weekly_freq = 1 THEN
    v_package_valor := 240;
    v_package_desc := 'Pacote Apoio - 1x por semana';
  ELSIF v_max_weekly_freq = 2 THEN
    v_package_valor := 360;
    v_package_desc := 'Pacote Apoio - 2x por semana';
  ELSIF v_max_weekly_freq >= 3 THEN
    v_package_valor := 450;
    v_package_desc := 'Pacote Apoio - Semana Inteira';
  ELSE
    v_package_valor := 0;
    v_package_desc := 'Pacote Apoio';
  END IF;

  -- 5. If no invoice exists, create one
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

  -- 6. Update or insert the package fee item (identified by having agendamento_id IS NULL and starting with 'Pacote Apoio')
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

  -- 7. Ensure all 'Apoio' session items for this patient and month are linked to this invoice and have value 0
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

  -- 8. Recalculate fatura total
  UPDATE public.faturas
  SET valor = COALESCE((
    SELECT SUM(total)
    FROM public.fatura_itens
    WHERE fatura_id = v_fatura_id
  ), 0)
  WHERE id = v_fatura_id;

END;
$$;


-- 2. Recreate the trigger function tg_sync_agendamento_financeiro to use fn_recalculate_apoio_package
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
BEGIN
  -- A. CLEANUP ONLY IF ACTION IS DELETE
  IF TG_OP = 'DELETE' THEN
    -- Get old item details
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = OLD.id;

    IF v_item_id IS NOT NULL THEN
      DELETE FROM public.fatura_itens WHERE id = v_item_id;
    END IF;

    v_old_especialidade := public.fn_get_especialidade(OLD.servico_id, OLD.paciente_id, OLD.profissional_id);
    v_old_competencia := date_trunc('month', OLD.data_inicio)::date;

    IF lower(v_old_especialidade) = 'apoio' THEN
      -- Recalculate Apoio package
      PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
    ELSE
      -- Clean up old non-apoio fatura if empty
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
    -- Resolve specialties
    v_especialidade := public.fn_get_especialidade(NEW.servico_id, NEW.paciente_id, NEW.profissional_id);
    IF TG_OP = 'UPDATE' THEN
      v_old_especialidade := public.fn_get_especialidade(OLD.servico_id, OLD.paciente_id, OLD.profissional_id);
      v_old_competencia := date_trunc('month', OLD.data_inicio)::date;
    END IF;

    -- Check if item already exists for this agendamento
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      -- Resolve target status
      v_target_status := CASE WHEN NEW.status = 'pago' THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END;
      v_competencia := date_trunc('month', NEW.data_inicio)::date;

      -- Resolve description
      SELECT nome INTO v_paciente_nome FROM public.pacientes WHERE id = NEW.paciente_id;
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF NEW.observacoes LIKE '[Tipo: Anamnese]%' THEN
        v_tipo_agendamento := 'anamnese';
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_tipo_agendamento := 'sessao';
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- CASE 1: SPECIALTY IS APOIO
      IF lower(v_especialidade) = 'apoio' THEN
        -- Resolve consolidated fatura_id for Apoio
        SELECT id INTO v_fatura_id
        FROM public.faturas
        WHERE paciente_id = NEW.paciente_id
          AND competencia = v_competencia
          AND especialidade = 'Apoio'
        LIMIT 1;

        IF v_fatura_id IS NULL THEN
          -- Temporarily create fatura (will be updated by fn_recalculate_apoio_package)
          INSERT INTO public.faturas (paciente_id, competencia, valor, status, especialidade)
          VALUES (NEW.paciente_id, v_competencia, 0, 'aberta', 'Apoio')
          RETURNING id INTO v_fatura_id;
        END IF;

        -- Update or insert session item (value 0)
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

        -- Recalculate package price and invoice total
        PERFORM public.fn_recalculate_apoio_package(NEW.paciente_id, v_competencia);

        -- If the session was moved from another month/patient or changed from another specialty, recalculate the old package
        IF TG_OP = 'UPDATE' AND (OLD.paciente_id <> NEW.paciente_id OR v_old_competencia <> v_competencia OR lower(v_old_especialidade) <> 'apoio') THEN
          IF lower(v_old_especialidade) = 'apoio' THEN
            PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
          END IF;
        END IF;

      -- CASE 2: SPECIALTY IS NOT APOIO
      ELSE
        -- 1-to-1 Mapping: If fatura already exists, reuse it. Otherwise, always create a NEW fatura
        v_valor := public.fn_get_pricing(NEW.paciente_id, NEW.profissional_id, v_especialidade, v_tipo_agendamento);

        IF v_item_id IS NOT NULL THEN
          v_fatura_id := v_old_fatura_id;
          
          UPDATE public.faturas
          SET status = v_target_status,
              pago_em = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
              metodo = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN 'pix'::public.metodo_pagamento ELSE NULL END,
              especialidade = v_especialidade,
              profissional_id = NEW.profissional_id
          WHERE id = v_fatura_id;
        ELSE
          INSERT INTO public.faturas (paciente_id, competencia, valor, status, pago_em, metodo, especialidade, profissional_id)
          VALUES (
            NEW.paciente_id, 
            v_competencia, 
            0, 
            v_target_status,
            CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
            CASE WHEN v_target_status = 'paga'::public.fatura_status THEN 'pix'::public.metodo_pagamento ELSE NULL END,
            v_especialidade,
            NEW.profissional_id
          )
          RETURNING id INTO v_fatura_id;
        END IF;

        -- Update or insert item
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

        -- If it was changed from Apoio to non-Apoio, recalculate the old Apoio package
        IF TG_OP = 'UPDATE' AND lower(v_old_especialidade) = 'apoio' THEN
          PERFORM public.fn_recalculate_apoio_package(OLD.paciente_id, v_old_competencia);
        END IF;
      END IF;

    ELSE
      -- Status is not realizado, pago or falta, but item exists (we need to remove it)
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
        
        IF lower(v_especialidade) = 'apoio' THEN
          PERFORM public.fn_recalculate_apoio_package(NEW.paciente_id, date_trunc('month', NEW.data_inicio)::date);
        ELSE
          -- Clean up non-apoio fatura if empty
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

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;


-- 3. Data Migration: Group existing Apoio sessions of each patient into monthly packages
DO $$
DECLARE
  r RECORD;
  v_fatura_id uuid;
BEGIN
  -- First, delete any existing manual package items to prevent duplicates
  DELETE FROM public.fatura_itens WHERE agendamento_id IS NULL AND (descricao LIKE 'Pacote Apoio%' OR descricao = 'Pacote Apoio');

  -- Loop through all patient/competency groups that have Apoio sessions
  FOR r IN
    SELECT 
      a.paciente_id,
      date_trunc('month', a.data_inicio)::date as competencia
    FROM public.agendamentos a
    WHERE a.status IN ('realizado', 'pago', 'falta')
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio'
    GROUP BY a.paciente_id, date_trunc('month', a.data_inicio)::date
  LOOP
    -- A. Find or create a consolidated Apoio invoice for this patient and month
    SELECT id INTO v_fatura_id
    FROM public.faturas
    WHERE paciente_id = r.paciente_id
      AND competencia = r.competencia
      AND especialidade = 'Apoio'
    LIMIT 1;

    IF v_fatura_id IS NULL THEN
      INSERT INTO public.faturas (paciente_id, competencia, valor, status, especialidade)
      VALUES (r.paciente_id, r.competencia, 0, 'aberta', 'Apoio')
      RETURNING id INTO v_fatura_id;
    END IF;

    -- B. Link all Apoio sessions of this patient/month to this consolidated invoice and set their values to 0
    UPDATE public.fatura_itens fi
    SET fatura_id = v_fatura_id,
        valor_unitario = 0,
        total = 0
    FROM public.agendamentos a
    WHERE fi.agendamento_id = a.id
      AND a.paciente_id = r.paciente_id
      AND date_trunc('month', a.data_inicio)::date = r.competencia
      AND a.status IN ('realizado', 'pago', 'falta')
      AND lower(public.fn_get_especialidade(a.servico_id, a.paciente_id, a.profissional_id)) = 'apoio';

    -- C. Recalculate the package item and total value
    PERFORM public.fn_recalculate_apoio_package(r.paciente_id, r.competencia);
  END LOOP;

  -- D. Clean up empty faturas that were split or orphaned
  DELETE FROM public.faturas f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
  ) AND (f.especialidade = 'Apoio' OR f.valor = 0);

END $$;
