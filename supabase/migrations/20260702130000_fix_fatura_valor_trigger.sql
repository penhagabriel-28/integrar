-- Migration to recreate tg_sync_fatura_valor and fix out-of-sync faturas totals

-- 1. Recreate the trigger function to update fatura valor when items change
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

-- 2. Ensure trigger exists on fatura_itens table
DROP TRIGGER IF EXISTS tr_sync_fatura_valor ON public.fatura_itens;
CREATE TRIGGER tr_sync_fatura_valor
  AFTER INSERT OR UPDATE OR DELETE ON public.fatura_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_fatura_valor();

-- 3. Backfill/Recalculate all non-Apoio faturas totals to ensure everything is synchronized
UPDATE public.faturas f
SET valor = COALESCE((
  SELECT SUM(total)
  FROM public.fatura_itens
  WHERE fatura_id = f.id
), 0)
WHERE f.especialidade <> 'Apoio' OR f.especialidade IS NULL;
