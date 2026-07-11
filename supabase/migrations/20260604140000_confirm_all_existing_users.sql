-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Confirm all existing users in auth.users
UPDATE auth.users
SET 
  confirmed_at = COALESCE(confirmed_at, now()),
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE confirmed_at IS NULL OR email_confirmed_at IS NULL;

-- Also check if they need identities
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT 
  id::text,
  id,
  format('{"sub":"%s","email":"%s"}', id::text, email)::jsonb,
  'email',
  id::text,
  now(),
  created_at,
  updated_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
) ON CONFLICT DO NOTHING;
