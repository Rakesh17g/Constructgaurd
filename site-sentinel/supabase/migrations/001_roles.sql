-- Role-based Authentication & Dashboard Setup

-- 1. Create the profiles table to securely store user roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'reporter' CHECK (role IN ('reporter', 'safety_officer', 'admin')),
  created_at timestamptz DEFAULT now()
);

-- 2. Prevent users from editing their own roles (backend enforcement)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

-- Only admins can manage profiles (update/delete)
-- To bootstrap, the first admin can be set directly via Supabase SQL editor:
-- UPDATE profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';

CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update profiles" 
ON public.profiles FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 3. Auto-sync auth.users to profiles
-- This ensures every new signup gets a corresponding row in 'profiles' with 'reporter' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (new.id, new.email, 'reporter');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Optional: To secure the existing 'inspections' table if used in the backend
-- ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY "Reporters can view their own inspections" ON public.inspections FOR SELECT
-- USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('safety_officer', 'admin')));
--
-- CREATE POLICY "Reporters can create inspections" ON public.inspections FOR INSERT
-- WITH CHECK (auth.uid() = user_id);
