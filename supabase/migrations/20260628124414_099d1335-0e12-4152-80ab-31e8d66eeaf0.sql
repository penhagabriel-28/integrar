GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO authenticated;
GRANT ALL ON public.profissionais TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
GRANT ALL ON public.pacientes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paciente_profissional TO authenticated;
GRANT ALL ON public.paciente_profissional TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicos TO authenticated;
GRANT ALL ON public.servicos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO authenticated;
GRANT ALL ON public.salas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO authenticated;
GRANT ALL ON public.responsaveis TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anamneses TO authenticated;
GRANT ALL ON public.anamneses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_documento TO authenticated;
GRANT ALL ON public.tipos_documento TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_relatorios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.controle_relatorios TO authenticated;
GRANT ALL ON public.controle_relatorios TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faturas TO authenticated;
GRANT ALL ON public.faturas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_itens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_itens TO authenticated;
GRANT ALL ON public.fatura_itens TO service_role;