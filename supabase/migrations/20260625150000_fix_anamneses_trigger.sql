-- 1. Criar a função específica para atualizar a coluna atualizado_em
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN 
  NEW.atualizado_em = now(); 
  RETURN NEW; 
END;
$$;

-- 2. Remover o gatilho antigo com erro
DROP TRIGGER IF EXISTS trg_anamneses_upd ON public.anamneses;

-- 3. Criar o novo gatilho usando a função correta
CREATE TRIGGER trg_anamneses_upd 
  BEFORE UPDATE ON public.anamneses 
  FOR EACH ROW 
  EXECUTE FUNCTION public.set_atualizado_em();
