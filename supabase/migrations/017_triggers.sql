-- ============================================================
-- LIFE-RPG PROTOCOL — Triggers & Functions
-- Auto-create profiles, auto-update levels
-- ============================================================

-- ── Auto-create profile when user signs up via Supabase Auth ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── Auto-update level when XP changes ────────────────────────
-- Level formula: floor(1 + sqrt(XP / 100))
CREATE OR REPLACE FUNCTION public.update_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.level = FLOOR(1 + SQRT(NEW.xp::FLOAT / 100));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_xp_update ON public.profiles;
CREATE TRIGGER on_xp_update
  BEFORE UPDATE OF xp ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_level();
