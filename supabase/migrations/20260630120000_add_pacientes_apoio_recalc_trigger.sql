-- Migration to automatically trigger fn_recalculate_apoio_package
-- when a patient's Apoio-related configurations are updated in the database.

CREATE OR REPLACE FUNCTION public.tg_sync_paciente_apoio_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_competencia date;
BEGIN
  v_competencia := date_trunc('month', now())::date;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cids_secundarios IS NOT NULL AND NEW.cids_secundarios::text ILIKE '%apoio%' THEN
      PERFORM public.fn_recalculate_apoio_package(NEW.id, v_competencia);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.cids_secundarios IS NOT NULL AND NEW.cids_secundarios::text ILIKE '%apoio%')
       OR (OLD.cids_secundarios::text ILIKE '%apoio%' AND NOT NEW.cids_secundarios::text ILIKE '%apoio%')
       OR (OLD.apoio_frequencia IS DISTINCT FROM NEW.apoio_frequencia)
       OR (OLD.apoio_valor_personalizado IS DISTINCT FROM NEW.apoio_valor_personalizado)
    THEN
      PERFORM public.fn_recalculate_apoio_package(NEW.id, v_competencia);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_paciente_apoio_recalc ON public.pacientes;
CREATE TRIGGER tr_sync_paciente_apoio_recalc
  AFTER INSERT OR UPDATE ON public.pacientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_paciente_apoio_recalc();
