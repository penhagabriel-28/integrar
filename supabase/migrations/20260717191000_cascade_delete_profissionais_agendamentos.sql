-- Migration to alter foreign key constraint on agendamentos to cascade on professional delete
ALTER TABLE public.agendamentos
  DROP CONSTRAINT IF EXISTS agendamentos_profissional_id_fkey;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_profissional_id_fkey
  FOREIGN KEY (profissional_id)
  REFERENCES public.profissionais(id)
  ON DELETE CASCADE;
