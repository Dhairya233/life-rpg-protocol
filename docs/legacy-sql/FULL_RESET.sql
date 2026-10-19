-- ============================================================
-- LIFE-RPG PROTOCOL — Fresh Database Setup
-- Following SYSTEM_DESIGN.md v1.2 conventions
-- Paste this entire script in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. TABLES                                               ║
-- ╚══════════════════════════════════════════════════════════╝

-- Profiles — core user stats (1:1 with auth.users)
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  aura          INTEGER NOT NULL DEFAULT 0 CHECK (aura >= 0),
  xp            INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  luck          INTEGER NOT NULL DEFAULT 50,
  theme         TEXT NOT NULL DEFAULT 'classic' CHECK (theme IN ('classic', 'modern')),
  streak_days   INTEGER NOT NULL DEFAULT 0,
  last_active   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quests — reusable quest templates
CREATE TABLE public.quests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'legendary')),
  skill_type       TEXT NOT NULL CHECK (skill_type IN ('focus', 'coding', 'fitness', 'creative')),
  xp_reward        INTEGER NOT NULL,
  aura_reward      INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL,
  requires_proof   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Quests — per-user quest progress
CREATE TABLE public.user_quests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id        UUID NOT NULL REFERENCES public.quests(id),
  status          TEXT NOT NULL DEFAULT 'idle'
                  CHECK (status IN ('idle', 'active', 'pending_verification', 'completed', 'failed')),
  proof_url       TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  aura_penalty    INTEGER NOT NULL DEFAULT 0,
  jury_verdict    NUMERIC(4,3),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quest_id)
);

-- Jury Votes — weighted peer review votes
CREATE TABLE public.jury_votes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_quest_id       UUID NOT NULL REFERENCES public.user_quests(id) ON DELETE CASCADE,
  juror_id            UUID NOT NULL REFERENCES public.profiles(id),
  vote                BOOLEAN NOT NULL,
  juror_aura_snapshot INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_quest_id, juror_id)
);

-- Aura Log — immutable audit trail of every Aura change
CREATE TABLE public.aura_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. TRIGGERS                                             ║
-- ╚══════════════════════════════════════════════════════════╝

-- Auto-create profile when user signs up
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Auto-update level when XP changes: Level = floor(1 + sqrt(XP / 100))
CREATE OR REPLACE FUNCTION public.update_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.level = FLOOR(1 + SQRT(NEW.xp::FLOAT / 100));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_xp_update
  BEFORE UPDATE OF xp ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.update_level();


-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. ROW LEVEL SECURITY                                   ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_public_read" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quests_public_read" ON public.quests FOR SELECT USING (TRUE);

ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_quests_owner" ON public.user_quests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "user_quests_jury_read" ON public.user_quests FOR SELECT USING (status = 'pending_verification');

ALTER TABLE public.jury_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jury_votes_insert_own" ON public.jury_votes FOR INSERT WITH CHECK (auth.uid() = juror_id);
CREATE POLICY "jury_votes_read_own" ON public.jury_votes FOR SELECT USING (auth.uid() = juror_id);

ALTER TABLE public.aura_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aura_log_own_read" ON public.aura_log FOR SELECT USING (auth.uid() = user_id);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. RPC FUNCTIONS                                        ║
-- ╚══════════════════════════════════════════════════════════╝

-- Deduct Aura (atomic deduction + audit log)
CREATE OR REPLACE FUNCTION public.deduct_aura(p_user_id UUID, p_amount INT, p_reason TEXT)
RETURNS INT AS $$
DECLARE v_new_aura INT;
BEGIN
  UPDATE public.profiles SET aura = GREATEST(0, aura - p_amount) WHERE id = p_user_id RETURNING aura INTO v_new_aura;
  INSERT INTO public.aura_log (user_id, delta, reason) VALUES (p_user_id, -p_amount, p_reason);
  RETURN v_new_aura;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant Quest Rewards (XP + Aura)
CREATE OR REPLACE FUNCTION public.grant_quest_rewards(p_user_id UUID, p_xp_amount INT, p_aura_amount INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles SET xp = xp + p_xp_amount, aura = aura + p_aura_amount WHERE id = p_user_id;
  IF p_aura_amount > 0 THEN
    INSERT INTO public.aura_log (user_id, delta, reason) VALUES (p_user_id, p_aura_amount, 'quest_complete');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Start Quest
CREATE OR REPLACE FUNCTION public.start_quest(p_user_id UUID, p_quest_id UUID)
RETURNS UUID AS $$
DECLARE v_uq_id UUID;
BEGIN
  INSERT INTO public.user_quests (user_id, quest_id, status, started_at) VALUES (p_user_id, p_quest_id, 'active', NOW())
  ON CONFLICT (user_id, quest_id) DO UPDATE SET status = 'active', started_at = NOW()
  RETURNING id INTO v_uq_id;
  RETURN v_uq_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Submit Quest Proof
CREATE OR REPLACE FUNCTION public.submit_quest_proof(p_user_quest_id UUID, p_proof_url TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_quests SET status = 'pending_verification', proof_url = p_proof_url WHERE id = p_user_quest_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get Jury Pool (randomised, excludes submitter, min Aura 100)
CREATE OR REPLACE FUNCTION public.get_jury_pool(p_submitter UUID, p_quest UUID, p_size INT DEFAULT 5)
RETURNS SETOF public.profiles AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.profiles WHERE id != p_submitter AND aura >= 100 ORDER BY RANDOM() LIMIT p_size;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve Verdict (weighted voting: Σ(vote×aura) / Σ(aura))
CREATE OR REPLACE FUNCTION public.resolve_verdict(p_user_quest_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_verdict NUMERIC; v_vote_count INT; v_user_id UUID; v_quest_id UUID;
  v_xp_reward INT; v_aura_reward INT; v_result TEXT;
BEGIN
  SELECT COUNT(*) INTO v_vote_count FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;
  IF v_vote_count < 3 THEN RETURN 'insufficient_votes'; END IF;

  SELECT COALESCE(SUM(CASE WHEN vote THEN juror_aura_snapshot ELSE 0 END)::NUMERIC / NULLIF(SUM(juror_aura_snapshot), 0), 0.5)
  INTO v_verdict FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;

  SELECT uq.user_id, uq.quest_id, q.xp_reward, q.aura_reward INTO v_user_id, v_quest_id, v_xp_reward, v_aura_reward
  FROM public.user_quests uq JOIN public.quests q ON uq.quest_id = q.id WHERE uq.id = p_user_quest_id;

  IF v_verdict >= 0.6 THEN
    UPDATE public.user_quests SET status = 'completed', jury_verdict = v_verdict, completed_at = NOW() WHERE id = p_user_quest_id;
    PERFORM public.grant_quest_rewards(v_user_id, v_xp_reward, v_aura_reward);
    v_result := 'approved';
  ELSIF v_verdict < 0.4 THEN
    UPDATE public.user_quests SET status = 'failed', jury_verdict = v_verdict WHERE id = p_user_quest_id;
    PERFORM public.deduct_aura(v_user_id, 20, 'jury_rejection');
    v_result := 'rejected';
  ELSE
    v_result := 'inconclusive';
  END IF;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update Streak
CREATE OR REPLACE FUNCTION public.update_streak(p_user_id UUID)
RETURNS VOID AS $$
DECLARE v_last_active DATE; v_today DATE := CURRENT_DATE; v_streak INT;
BEGIN
  SELECT last_active, streak_days INTO v_last_active, v_streak FROM public.profiles WHERE id = p_user_id;
  IF v_last_active = v_today THEN RETURN;
  ELSIF v_last_active = v_today - 1 THEN v_streak := v_streak + 1;
  ELSE v_streak := 1;
  END IF;
  UPDATE public.profiles SET streak_days = v_streak, last_active = v_today WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  5. INDEXES                                              ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE INDEX idx_user_quests_status ON public.user_quests(status);
CREATE INDEX idx_user_quests_user_id ON public.user_quests(user_id);
CREATE INDEX idx_jury_votes_quest ON public.jury_votes(user_quest_id);
CREATE INDEX idx_aura_log_user_created ON public.aura_log(user_id, created_at DESC);
CREATE INDEX idx_user_quests_pending ON public.user_quests(status) WHERE status = 'pending_verification';


-- ╔══════════════════════════════════════════════════════════╗
-- ║  6. STORAGE                                              ║
-- ╚══════════════════════════════════════════════════════════╝

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('submissions', 'submissions', FALSE, 5242880)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "submissions_upload_own" ON storage.objects;
CREATE POLICY "submissions_upload_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "submissions_read_own" ON storage.objects;
CREATE POLICY "submissions_read_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "submissions_delete_own" ON storage.objects;
CREATE POLICY "submissions_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ╔══════════════════════════════════════════════════════════╗
-- ║  7. REALTIME + LEADERBOARD                               ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_quests;

CREATE OR REPLACE VIEW public.leaderboard AS
SELECT id, username, aura, xp, level, streak_days, created_at
FROM public.profiles ORDER BY xp DESC;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  8. SEED QUESTS                                          ║
-- ╚══════════════════════════════════════════════════════════╝

INSERT INTO public.quests (title, description, difficulty, skill_type, xp_reward, aura_reward, duration_minutes, requires_proof) VALUES
  ('Deep Work Sprint',        'Complete a 25-minute focused work session without distractions.',          'easy',      'focus',    200,   10,   25,  TRUE),
  ('Focus Marathon',          'Sustain 60 minutes of uninterrupted deep work.',                           'medium',    'focus',    500,   25,   60,  TRUE),
  ('Deep Work',               'Complete a 90-minute focused session. No distractions. Pure discipline.',   'hard',      'focus',    800,   50,   90,  TRUE),
  ('The Iron Mind',           'Complete a legendary 120-minute focus session. Only the worthy survive.',   'legendary', 'focus',   1500,  120,  120,  TRUE),
  ('Bug Squasher',            'Find and fix a bug in your codebase. Document what you found.',             'easy',      'coding',   150,    5,   30,  TRUE),
  ('Ship a Feature',          'Complete and deploy a new feature to production.',                          'hard',      'coding',  1000,   60,  120,  TRUE),
  ('Code Review Warrior',     'Review 3 pull requests with meaningful, constructive feedback.',            'medium',    'coding',   400,   20,   45,  TRUE),
  ('Open Source Contribution', 'Make a meaningful contribution to an open source project.',               'legendary', 'coding',  2000,  100,  180,  TRUE),
  ('Morning Stretch',         'Complete a 15-minute stretching or yoga routine.',                          'easy',      'fitness',  100,    5,   15,  TRUE),
  ('Cardio Burst',            'Complete a 30-minute cardio session (running, cycling, swimming).',         'medium',    'fitness',  350,   15,   30,  TRUE),
  ('Iron Temple',             'Complete a full strength training workout. Push your limits.',               'hard',      'fitness',  700,   40,   60,  TRUE),
  ('Ultra Endurance',         'Complete a 90+ minute endurance activity. Mind over body.',                  'legendary', 'fitness', 1200,   80,   90,  TRUE),
  ('Sketch Session',          'Spend 20 minutes sketching, drawing, or designing.',                        'easy',      'creative', 120,    5,   20,  TRUE),
  ('Write 500 Words',         'Write at least 500 words — blog post, journal, story, anything.',           'medium',    'creative', 300,   15,   40,  TRUE),
  ('Create & Publish',        'Create a piece of content and publish it publicly.',                         'hard',      'creative', 800,   50,   60,  TRUE),
  ('Masterwork',              'Complete a significant creative project — video, article, design system.',   'legendary', 'creative',1800,  100,  180,  TRUE);


-- ============================================================
-- ✅ SETUP COMPLETE — You should see:
--    5 tables:  profiles, quests, user_quests, jury_votes, aura_log
--    1 view:    leaderboard
--    7 RPCs:    deduct_aura, grant_quest_rewards, start_quest,
--              submit_quest_proof, get_jury_pool, resolve_verdict, update_streak
--    2 triggers: on_auth_user_created, on_xp_update
--    16 seed quests across focus/coding/fitness/creative
-- ============================================================
