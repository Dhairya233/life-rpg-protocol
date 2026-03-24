-- ============================================================
-- LIFE-RPG PROTOCOL — Row Level Security Policies
-- ============================================================

-- ── PROFILES ───────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Aura is public (needed for jury weight display + leaderboard)
DROP POLICY IF EXISTS "Anyone can read aura" ON public.profiles;
CREATE POLICY "Anyone can read aura"
  ON public.profiles FOR SELECT
  USING (TRUE);

-- ── QUESTS ─────────────────────────────────────────────────
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read quests" ON public.quests;
CREATE POLICY "Anyone can read quests"
  ON public.quests FOR SELECT
  USING (TRUE);

-- ── USER_QUESTS ────────────────────────────────────────────
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages own quests" ON public.user_quests;
CREATE POLICY "Owner manages own quests"
  ON public.user_quests
  FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Jury reads pending verification" ON public.user_quests;
CREATE POLICY "Jury reads pending verification"
  ON public.user_quests FOR SELECT
  USING (status = 'pending_verification');

-- ── JURY_VOTES ─────────────────────────────────────────────
ALTER TABLE public.jury_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Juror inserts own vote" ON public.jury_votes;
CREATE POLICY "Juror inserts own vote"
  ON public.jury_votes FOR INSERT
  WITH CHECK (auth.uid() = juror_id);

DROP POLICY IF EXISTS "Juror reads own votes" ON public.jury_votes;
CREATE POLICY "Juror reads own votes"
  ON public.jury_votes FOR SELECT
  USING (auth.uid() = juror_id);

-- ── AURA_LOG ───────────────────────────────────────────────
ALTER TABLE public.aura_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own aura log" ON public.aura_log;
CREATE POLICY "Users read own aura log"
  ON public.aura_log FOR SELECT
  USING (auth.uid() = user_id);
