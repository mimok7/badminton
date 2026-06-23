-- Fix auth.users -> public.profiles sync trigger
-- Goal:
-- 1. Link a new auth user to an existing placeholder profile by email first
-- 2. Avoid duplicate profile creation when a placeholder already exists
-- 3. Reduce the chance of auth user creation failing because of profile sync issues

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  matched_profile_id uuid;
BEGIN
  -- If this auth user is already linked, do nothing.
  SELECT p.id
  INTO matched_profile_id
  FROM public.profiles p
  WHERE p.user_id = NEW.id
  LIMIT 1;

  IF matched_profile_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- First priority: attach to an existing placeholder profile with the same email.
  SELECT p.id
  INTO matched_profile_id
  FROM public.profiles p
  WHERE p.email = NEW.email
    AND p.user_id IS NULL
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;

  IF matched_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      user_id = NEW.id,
      email = COALESCE(NEW.email, email),
      updated_at = now()
    WHERE id = matched_profile_id;

    RETURN NEW;
  END IF;

  -- Otherwise create a fresh linked profile row.
  INSERT INTO public.profiles (
    user_id,
    email,
    username,
    full_name,
    role,
    skill_level
  )
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'user'),
    'E2'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();
