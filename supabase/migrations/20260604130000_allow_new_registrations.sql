-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create a BEFORE INSERT trigger function to auto-confirm new users
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created_before_insert ON auth.users;
CREATE TRIGGER on_auth_user_created_before_insert
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.auto_confirm_user();

-- Update the handle_new_user trigger function to:
-- 1. Create/update the profile
-- 2. Grant roles correctly (only the first user and gabymartyns04@gmail.com are admin)
-- 3. Check if email exists in public.profissionais and set role to 'profissional' + link user_id
-- 4. Otherwise, set role to 'recepcionista'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
  is_prof BOOLEAN;
BEGIN
  -- Insert or update profile
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  -- Check if first user
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  -- Check if they are in professionals table
  SELECT EXISTS (SELECT 1 FROM public.profissionais WHERE email = NEW.email) INTO is_prof;

  IF is_first OR NEW.email = 'gabymartyns04@gmail.com' THEN
    -- Admin role
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF is_prof THEN
    -- Professional role
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'profissional')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Link user_id in profissionais table
    UPDATE public.profissionais
    SET user_id = NEW.id
    WHERE email = NEW.email;
  ELSE
    -- Receptionist role
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;
