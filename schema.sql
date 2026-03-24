-- ============================================================
-- THE LIFE-RPG PROTOCOL — Supabase PostgreSQL Schema
-- Sprint 1: Data Foundation
-- ============================================================

-- Enable UUID extension (usually already on in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE quest_status AS ENUM ('available', 'active', 'completed', 'failed', 'expired');
CREATE TYPE quest_difficulty AS ENUM ('trivial', 'easy', 'normal', 'hard', 'legendary');
CREATE TYPE skill_branch AS ENUM ('silicon', 'vitality', 'influence');
CREATE TYPE theme_preference AS ENUM ('classic_rpg', 'clean_modern');

-- ============================================================
-- TABLE: profiles
-- Core user character sheet — extends Supabase auth.users
-- ============================================================

CREATE TABLE public.profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         TEXT UNIQUE NOT NULL,
  display_name     TEXT,
  avatar_url       TEXT,

  -- Core Stats
  xp               BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  aura             INT    NOT NULL DEFAULT 100 CHECK (aura BETWEEN 0 AND 1000),
  luck             INT    NOT NULL DEFAULT 50  CHECK (luck BETWEEN 0 AND 100),

  -- Skill Branch XP (sub-pools that feed into total XP)
  silicon_xp       BIGINT NOT NULL DEFAULT 0 CHECK (silicon_xp >= 0),   -- tech / learning
  vitality_xp      BIGINT NOT NULL DEFAULT 0 CHECK (vitality_xp >= 0),  -- health / fitness
  influence_xp     BIGINT NOT NULL DEFAULT 0 CHECK (influence_xp >= 0), -- social / leadership

  -- Computed fields (denormalized for query speed, kept in sync via trigger)
  level            INT    NOT NULL DEFAULT 1  CHECK (level >= 1),
  silicon_level    INT    NOT NULL DEFAULT 1  CHECK (silicon_level >= 1),
  vitality_level   INT    NOT NULL DEFAULT 1  CHECK (vitality_level >= 1),
  influence_level  INT    NOT NULL DEFAULT 1  CHECK (influence_level >= 1),

  -- Streak & Discipline
  current_streak   INT    NOT NULL DEFAULT 0,
  longest_streak   INT    NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,

  -- Preferences
  theme            theme_preference NOT NULL DEFAULT 'classic_rpg',
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  bio              TEXT,

  -- Timestamps
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: daily_stats
-- Snapshot of a user's stats each day — enables history charts
-- ============================================================

CREATE TABLE public.daily_stats (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stat_date    DATE        NOT NULL,

  -- Snapshot at end of day
  xp_total     BIGINT      NOT NULL DEFAULT 0,
  xp_gained    INT         NOT NULL DEFAULT 0,  -- XP earned on this specific day
  aura         INT         NOT NULL DEFAULT 100,
  luck         INT         NOT NULL DEFAULT 50,
  level        INT         NOT NULL DEFAULT 1,

  -- Branch snapshots
  silicon_xp   BIGINT      NOT NULL DEFAULT 0,
  vitality_xp  BIGINT      NOT NULL DEFAULT 0,
  influence_xp BIGINT      NOT NULL DEFAULT 0,

  -- Activity metrics
  quests_completed INT     NOT NULL DEFAULT 0,
  quests_failed    INT     NOT NULL DEFAULT 0,
  streak_day       INT     NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per user per day
  UNIQUE (user_id, stat_date)
);

-- ============================================================
-- TABLE: quests
-- Template / definition of a quest (reusable blueprint)
-- ============================================================

CREATE TABLE public.quests (
  id             UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who created this quest (NULL = system quest, global)
  created_by     UUID            REFERENCES public.profiles(id) ON DELETE SET NULL,

  title          TEXT            NOT NULL,
  description    TEXT,
  lore_text      TEXT,           -- Flavour/RPG story text

  -- Reward structure
  xp_reward      INT             NOT NULL DEFAULT 10 CHECK (xp_reward >= 0),
  aura_reward    INT             NOT NULL DEFAULT 0,
  luck_reward    INT             NOT NULL DEFAULT 0,
  branch         skill_branch    NOT NULL DEFAULT 'silicon',
  difficulty     quest_difficulty NOT NULL DEFAULT 'normal',

  -- Recurrence (NULL = one-time)
  is_recurring   BOOLEAN         NOT NULL DEFAULT FALSE,
  recur_interval INTERVAL,       -- e.g., '1 day', '7 days'

  -- Expiry
  expires_at     TIMESTAMPTZ,

  -- Visibility
  is_global      BOOLEAN         NOT NULL DEFAULT FALSE,  -- available to all users
  is_archived    BOOLEAN         NOT NULL DEFAULT FALSE,

  created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: user_quests
-- A user's personal instance/progress on a quest
-- ============================================================

CREATE TABLE public.user_quests (
  id             UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID            NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id       UUID            NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,

  status         quest_status    NOT NULL DEFAULT 'available',
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,

  -- Proof / notes submitted by user on completion
  completion_note TEXT,
  proof_url       TEXT,

  -- XP actually awarded (may differ from template if bonuses applied)
  xp_awarded      INT            DEFAULT 0,
  aura_awarded    INT            DEFAULT 0,

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, quest_id)    -- prevent duplicate assignments
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Function: calculateLevel(xp) — Logarithmic leveling curve
-- Level = floor(log base 1.5 of (xp / 100 + 1)) + 1
-- This gives roughly:
--   Level 1:   0 XP      Level 5:  ~756 XP
--   Level 10: ~5,766 XP  Level 20: ~43,923 XP
--   Level 50: ~2.4M XP
CREATE OR REPLACE FUNCTION calculate_level(p_xp BIGINT)
RETURNS INT AS $$
BEGIN
  RETURN GREATEST(1, FLOOR(LOG(1.5, (p_xp::FLOAT / 100.0) + 1))::INT + 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function: auto-update levels when XP changes
CREATE OR REPLACE FUNCTION sync_levels()
RETURNS TRIGGER AS $$
BEGIN
  NEW.level          := calculate_level(NEW.xp);
  NEW.silicon_level  := calculate_level(NEW.silicon_xp);
  NEW.vitality_level := calculate_level(NEW.vitality_xp);
  NEW.influence_level:= calculate_level(NEW.influence_xp);
  NEW.updated_at     := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_levels
  BEFORE INSERT OR UPDATE OF xp, silicon_xp, vitality_xp, influence_xp
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION sync_levels();

-- Trigger function: auto-update updated_at on quests
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quests_updated_at
  BEFORE UPDATE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_user_quests_updated_at
  BEFORE UPDATE ON public.user_quests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Trigger: auto-create profile when a new user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, but only write their own
CREATE POLICY "profiles_public_read"  ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "profiles_self_update"  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Daily stats: users read/write only their own
CREATE POLICY "daily_stats_own"       ON public.daily_stats FOR ALL USING (auth.uid() = user_id);

-- Quests: global quests are readable by all; own quests readable
CREATE POLICY "quests_read"           ON public.quests     FOR SELECT USING (is_global = TRUE OR auth.uid() = created_by);
CREATE POLICY "quests_own_write"      ON public.quests     FOR ALL    USING (auth.uid() = created_by);

-- User quests: own records only
CREATE POLICY "user_quests_own"       ON public.user_quests FOR ALL   USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_profiles_xp          ON public.profiles(xp DESC);
CREATE INDEX idx_profiles_aura        ON public.profiles(aura DESC);
CREATE INDEX idx_profiles_username    ON public.profiles(username);
CREATE INDEX idx_daily_stats_user     ON public.daily_stats(user_id, stat_date DESC);
CREATE INDEX idx_user_quests_user     ON public.user_quests(user_id, status);
CREATE INDEX idx_quests_branch        ON public.quests(branch, difficulty);
CREATE INDEX idx_quests_global        ON public.quests(is_global) WHERE is_global = TRUE;

-- ============================================================
-- SEED: System Quests (starter quests available to everyone)
-- ============================================================

INSERT INTO public.quests (title, description, lore_text, xp_reward, aura_reward, branch, difficulty, is_global)
VALUES
  ('Boot Sequence',         'Complete your profile setup.',             'Every legend begins with a name.', 50,  5,  'silicon',   'trivial',   TRUE),
  ('First Blood (Code)',    'Complete a coding challenge or tutorial.', 'The machine bows to those who speak its tongue.', 100, 0, 'silicon', 'easy', TRUE),
  ('Iron Protocol',         'Complete 7 consecutive daily check-ins.', 'Discipline is the only cheat code.',  200, 10, 'vitality',  'normal',    TRUE),
  ('The Handshake',         'Connect with 3 new people this week.',     'Reputation is built one node at a time.', 150, 20, 'influence', 'normal', TRUE),
  ('Silicon Awakening',     'Reach Silicon Level 5.',                   'The grid opens to those who persist.',  500, 0,  'silicon',   'hard',      TRUE),
  ('Vitality Surge',        'Complete 30 days of tracked activity.',    'The body is the first battlefield.',  750, 15, 'vitality',  'hard',      TRUE),
  ('Influence Cascade',     'Inspire someone to join the Protocol.',    'True power multiplies itself.',       1000, 50, 'influence', 'legendary', TRUE);
