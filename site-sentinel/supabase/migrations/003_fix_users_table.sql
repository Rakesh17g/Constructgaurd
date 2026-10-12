-- Fix Users Table RLS & Role Provisioning (Updated for Intended Roles)

-- 1. Enforce RLS on the exact table the frontend expects
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Allow users to read their own roles 
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
CREATE POLICY "Users can read own data" 
ON public.users FOR SELECT 
USING (auth.uid() = id);

-- 3. Trusted Provisioning Workflow (Backend-Enforced)
-- Dynamically assigns 'reporter' or 'safety_officer' based on frontend intent
-- Administrator access is STRICTLY DISALLOWED via this vector.
CREATE OR REPLACE FUNCTION public.provision_new_user()
RETURNS trigger AS $$
DECLARE
  intended text;
BEGIN
  -- Extract intended role from auth.users metadata safely
  intended := new.raw_user_meta_data->>'intended_role';
  
  -- If it's a valid self-registration role, assign it. Otherwise default to reporter.
  IF intended = 'safety_officer' THEN
    INSERT INTO public.users (id, role) VALUES (new.id, 'safety_officer') ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.users (id, role) VALUES (new.id, 'reporter') ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_signup ON auth.users;
CREATE TRIGGER on_auth_user_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.provision_new_user();

-- 4. Admin Role Assignment Process
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
CREATE POLICY "Admins can update users" 
ON public.users FOR UPDATE 
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
