-- Migration to recreate tg_sync_agendamento_financeiro to enforce a 1-to-1 relationship 
-- between public.agendamentos (sessions) and public.faturas (invoices),
-- preventing payment updates from synchronizing across multiple sessions of the same month.

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
  v_old_fatura_id uuid;
  v_paciente_nome text;
  v_data_str text;
  v_target_status public.fatura_status;
BEGIN
  -- A. CLEANUP ONLY IF ACTION IS DELETE
  IF TG_OP = 'DELETE' THEN
    -- Get old fatura id before delete
    SELECT fatura_id INTO v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = OLD.id;

    DELETE FROM public.fatura_itens WHERE agendamento_id = OLD.id;

    -- Clean up invoice if empty
    IF v_old_fatura_id IS NOT NULL THEN
      DELETE FROM public.faturas f
      WHERE f.id = v_old_fatura_id
        AND NOT EXISTS (
          SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
        );
    END IF;
  END IF;

  -- B. INSERT OR UPDATE NEW ITEM IF ACTION IS INSERT OR UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if item already exists for this agendamento
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      -- Resolve target status
      v_target_status := CASE WHEN NEW.status = 'pago' THEN 'paga'::public.fatura_status ELSE 'aberta'::public.fatura_status END;

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
      v_data_str := to_char(timezone('America/Sao_Paulo', NEW.data_inicio), 'DD/MM/YYYY HH24:MI');
      
      IF v_tipo_agendamento = 'anamnese' THEN
        v_descricao := COALESCE(v_especialidade, 'Avaliação') || ' (Avaliação) - ' || v_data_str;
      ELSE
        v_descricao := COALESCE(v_especialidade, 'Sessão') || ' - ' || v_data_str;
      END IF;

      -- 1-to-1 Mapping: If fatura already exists, reuse it. Otherwise, always create a NEW fatura
      IF v_item_id IS NOT NULL THEN
        v_fatura_id := v_old_fatura_id;
        
        -- Update the dedicated fatura
        UPDATE public.faturas
        SET status = v_target_status,
            pago_em = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
            metodo = CASE WHEN v_target_status = 'paga'::public.fatura_status THEN 'pix'::public.metodo_pagamento ELSE NULL END
        WHERE id = v_fatura_id;
      ELSE
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

      -- Check if we are updating an existing invoice item
      IF v_item_id IS NOT NULL THEN
        -- Update item description, unit price and total
        UPDATE public.fatura_itens
        SET descricao = v_descricao, valor_unitario = v_valor, total = v_valor
        WHERE id = v_item_id;
      ELSE
        -- Item does not exist, insert it
        INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
        VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);
      END IF;
    ELSE
      -- Status is not realizado, pago or falta, but item exists (we need to remove it)
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
        
        -- Clean up invoice if it is now empty (no items left)
        IF v_old_fatura_id IS NOT NULL THEN
          DELETE FROM public.faturas f
          WHERE f.id = v_old_fatura_id
            AND NOT EXISTS (
              SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
            );
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

-- DATA MIGRATION: Split existing consolidated invoices that contain multiple sessions
-- so that each session gets its own dedicated invoice.
DO $$
DECLARE
  r RECORD;
  v_new_fatura_id uuid;
BEGIN
  -- Find all items that are not the first item in their fatura
  FOR r IN 
    WITH ranked_items AS (
      SELECT 
        id AS item_id, 
        fatura_id, 
        total,
        ROW_NUMBER() OVER (PARTITION BY fatura_id ORDER BY id) as rn
      FROM public.fatura_itens
    )
    SELECT ri.item_id, ri.fatura_id, ri.total, f.paciente_id, f.competencia, f.status, f.vencimento, f.pago_em, f.metodo, f.observacoes, f.profissional_id, f.especialidade
    FROM ranked_items ri
    JOIN public.faturas f ON f.id = ri.fatura_id
    WHERE ri.rn > 1
  LOOP
    -- Create a new fatura for the item, copying original fatura details
    INSERT INTO public.faturas (
      paciente_id, competencia, valor, status, vencimento, pago_em, metodo, observacoes, profissional_id, especialidade
    ) VALUES (
      r.paciente_id, r.competencia, r.total, r.status, r.vencimento, r.pago_em, r.metodo, r.observacoes, r.profissional_id, r.especialidade
    )
    RETURNING id INTO v_new_fatura_id;

    -- Update the item to point to the new fatura
    UPDATE public.fatura_itens
    SET fatura_id = v_new_fatura_id
    WHERE id = r.item_id;
  END LOOP;

  -- Recalculate valor for all faturas
  UPDATE public.faturas f
  SET valor = COALESCE((
    SELECT SUM(total)
    FROM public.fatura_itens
    WHERE fatura_id = f.id
  ), 0);

  -- Remove empty faturas (if any became empty and are in status 'aberta' or other statuses, except manual faturas with no items but value > 0)
  DELETE FROM public.faturas f
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fatura_itens WHERE fatura_id = f.id
  ) AND f.valor = 0;

END $$;
