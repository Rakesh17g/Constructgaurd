-- Remove automatic role assignment
-- As requested, authenticated users should not be automatically assigned the 'reporter' role
-- upon signup, as this grants silent default privileges without explicit administrative action.

-- 1. Drop the trigger that automatically inserts new users into the profiles table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the function to clean up
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- From now on, when a user signs up, their profile must be manually created
-- and their role deliberately assigned by an administrator.

-- Note: The profiles table and its RLS policies from 001_roles.sql remain intact.
