-- Migration: Set default vencimento for all faturas and ensure future faturas automatically have due date on the 1st of subsequent month

-- 1. Backfill all existing faturas without vencimento
UPDATE public.faturas
SET vencimento = (competencia + interval '1 month')::date
WHERE vencimento IS NULL;

-- 2. Trigger function to ensure vencimento is always populated from competencia
CREATE OR REPLACE FUNCTION public.tg_faturas_default_vencimento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vencimento IS NULL AND NEW.competencia IS NOT NULL THEN
    NEW.vencimento := (NEW.competencia + interval '1 month')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_faturas_default_vencimento ON public.faturas;
CREATE TRIGGER tr_faturas_default_vencimento
  BEFORE INSERT OR UPDATE ON public.faturas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_faturas_default_vencimento();
