-- Migration to add profissional_id and especialidade columns to faturas table

ALTER TABLE public.faturas ADD COLUMN profissional_id uuid REFERENCES public.profissionais(id) ON DELETE SET NULL;
ALTER TABLE public.faturas ADD COLUMN especialidade text;
