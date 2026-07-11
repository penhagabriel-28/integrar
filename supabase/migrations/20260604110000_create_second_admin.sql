-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Update the handle_new_user trigger function to promote gabymartyns04@gmail.com to admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first OR NEW.email = 'gabymartyns04@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'recepcionista')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create user gabymartyns04@gmail.com with password Gabi2020@ if they do not exist
DO $$
DECLARE
  v_user_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'gabymartyns04@gmail.com';
  
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_encrypted_pw := extensions.crypt('Gabi2020@', extensions.gen_salt('bf'));
    
    -- 1. Insert into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'gabymartyns04@gmail.com',
      v_encrypted_pw,
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Gabi Martins"}'::jsonb,
      now(),
      now()
    );

    -- 2. Insert into auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_user_id::text,
      v_user_id,
      format('{"sub":"%s","email":"%s"}', v_user_id::text, 'gabymartyns04@gmail.com')::jsonb,
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  END IF;

  -- 3. Ensure they have the admin role in public.user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Remove other roles if they exist to prevent role conflicts
  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role != 'admin';
END $$;
