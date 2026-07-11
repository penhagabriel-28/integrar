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
