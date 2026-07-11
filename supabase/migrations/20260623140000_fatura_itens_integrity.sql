-- Migration to enforce referential integrity between fatura_itens and agendamentos,
-- and automatically keep faturas.valor totals synchronized.

-- 1. Ensure foreign key exists with ON DELETE CASCADE
ALTER TABLE public.fatura_itens
  DROP CONSTRAINT IF EXISTS fk_fatura_itens_agendamento;

ALTER TABLE public.fatura_itens
  ADD CONSTRAINT fk_fatura_itens_agendamento
  FOREIGN KEY (agendamento_id)
  REFERENCES public.agendamentos(id)
  ON DELETE CASCADE;

-- 2. Create the invoice total synchronization trigger function
CREATE OR REPLACE FUNCTION public.tg_sync_fatura_valor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fatura_id uuid;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_fatura_id := NEW.fatura_id;
  ELSE
    v_fatura_id := OLD.fatura_id;
  END IF;

  -- Update invoice total with the sum of its items
  UPDATE public.faturas
  SET valor = COALESCE((
    SELECT SUM(total)
    FROM public.fatura_itens
    WHERE fatura_id = v_fatura_id
  ), 0)
  WHERE id = v_fatura_id;

  -- Handle cleanup of old invoice if fatura_id changed during UPDATE
  IF TG_OP = 'UPDATE' AND OLD.fatura_id <> NEW.fatura_id THEN
    UPDATE public.faturas
    SET valor = COALESCE((
      SELECT SUM(total)
      FROM public.fatura_itens
      WHERE fatura_id = OLD.fatura_id
    ), 0)
    WHERE id = OLD.fatura_id;

    DELETE FROM public.faturas
    WHERE id = OLD.fatura_id
      AND status = 'aberta'
      AND NOT EXISTS (
        SELECT 1 FROM public.fatura_itens WHERE fatura_id = OLD.fatura_id
      );
  END IF;

  -- Delete target invoice if it became empty and is status 'aberta'
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    DELETE FROM public.faturas
    WHERE id = v_fatura_id
      AND status = 'aberta'
      AND NOT EXISTS (
        SELECT 1 FROM public.fatura_itens WHERE fatura_id = v_fatura_id
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Create trigger on fatura_itens
DROP TRIGGER IF EXISTS tr_sync_fatura_valor ON public.fatura_itens;
CREATE TRIGGER tr_sync_fatura_valor
  AFTER INSERT OR UPDATE OR DELETE ON public.fatura_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_fatura_valor();

-- 4. Simplify the agendamentos synchronization trigger function
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
    DELETE FROM public.fatura_itens WHERE agendamento_id = OLD.id;
  END IF;

  -- B. INSERT OR UPDATE NEW ITEM IF ACTION IS INSERT OR UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if item already exists for this agendamento
    SELECT id, fatura_id INTO v_item_id, v_old_fatura_id
    FROM public.fatura_itens
    WHERE agendamento_id = NEW.id;

    IF NEW.status = 'realizado' OR NEW.status = 'pago' OR NEW.status = 'falta' THEN
      -- Resolve target status (only 'pago' appointments generate paid invoices directly)
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
          CASE WHEN v_target_status = 'paga'::public.fatura_status THEN COALESCE(NEW.data_inicio, now()) ELSE NULL END,
          CASE WHEN v_target_status = 'paga'::public.fatura_status THEN 'pix'::public.metodo_pagamento ELSE NULL END
        )
        RETURNING id INTO v_fatura_id;
      END IF;

      -- Check if we are updating an existing invoice item
      IF v_item_id IS NOT NULL THEN
        IF v_old_fatura_id = v_fatura_id THEN
          -- Same invoice, update item description, unit price and total
          UPDATE public.fatura_itens
          SET descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;
        ELSE
          -- Different invoice, move item to new invoice
          UPDATE public.fatura_itens
          SET fatura_id = v_fatura_id, descricao = v_descricao, valor_unitario = v_valor, total = v_valor
          WHERE id = v_item_id;
        END IF;
      ELSE
        -- Item does not exist, insert it
        INSERT INTO public.fatura_itens (fatura_id, agendamento_id, descricao, quantidade, valor_unitario, total)
        VALUES (v_fatura_id, NEW.id, v_descricao, 1, v_valor, v_valor);
      END IF;
    ELSE
      -- Status is not realizado, pago or falta, but item exists (we need to remove it)
      IF v_item_id IS NOT NULL THEN
        DELETE FROM public.fatura_itens WHERE id = v_item_id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;
