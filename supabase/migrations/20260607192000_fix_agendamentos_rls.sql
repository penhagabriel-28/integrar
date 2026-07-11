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

-- Update the sync trigger function to run as SECURITY DEFINER
-- This ensures database side-effects (like syncing appointments with invoices) bypass RLS
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
