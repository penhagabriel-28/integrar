-- Create index to optimize performance of agendamento edits, deletes and triggers
CREATE INDEX IF NOT EXISTS idx_fatura_itens_agendamento ON public.fatura_itens(agendamento_id);
