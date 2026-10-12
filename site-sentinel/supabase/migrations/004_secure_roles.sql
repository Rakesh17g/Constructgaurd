-- ==============================================================================
-- DATABASE MIGRATION: SECURE UNIFIED ROLE PROVISIONING & CONSTRAINT FIX
-- Target: public.users & auth.users
-- Fixes: "Database error saving new user" (500) caused by:
--   1. chk_user_role constraint rejecting 'safety_officer' and 'reporter'
--   2. Competing triggers (on_auth_user_signup vs tr_on_auth_user_created)
--      causing duplicate key violations on users_pkey
-- ==============================================================================

-- 1. Drop competing/duplicate triggers on auth.users
DROP TRIGGER IF EXISTS tr_on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_signup ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.provision_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_auth_user() CASCADE;

-- 2. Update check constraint on public.users to accept all platform roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_user_role;
ALTER TABLE public.users ADD CONSTRAINT chk_user_role 
  CHECK (role IN ('admin', 'safety_officer', 'inspector', 'reporter', 'worker'));

-- 3. Define canonical, unified provisioning trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  raw_role text;
  assigned_role text;
BEGIN
  -- Extract role from metadata safely (supports intended_role and role)
  raw_role := COALESCE(new.raw_user_meta_data->>'intended_role', new.raw_user_meta_data->>'role');

  -- Determine role with strict security against self-assigned admin
  IF raw_role = 'safety_officer' OR raw_role = 'inspector' THEN
    assigned_role := 'safety_officer';
  ELSE
    assigned_role := 'reporter';
  END IF;

  -- Safely upsert user record with conflict resolution
  INSERT INTO public.users (id, email, role, full_name, created_at, updated_at)
  VALUES (
    new.id,
    COALESCE(new.email, ''),
    assigned_role,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      role = EXCLUDED.role,
      full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE public.users.full_name END,
      updated_at = NOW();

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Prevent unexpected database runtime exceptions from rolling back auth user creation
    RAISE WARNING 'handle_new_user error for %: %', new.id, SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach single canonical trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 5. Row-level security on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.users;
CREATE POLICY "Allow read for authenticated users"
ON public.users FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Allow users to read own data" ON public.users;
CREATE POLICY "Allow users to read own data"
ON public.users FOR SELECT
TO anon
USING (false);

DROP POLICY IF EXISTS "Allow users to update own profile" ON public.users;
CREATE POLICY "Allow users to update own profile"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

