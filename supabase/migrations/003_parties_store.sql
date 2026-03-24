-- ============================================================
-- Migration 003: Parties/Guilds + Aura Sinks (Marketplace)
-- Strategy: 100% additive. No existing tables altered.
-- ============================================================

-- ── 1. PARTIES ────────────────────────────────────────────────
-- A party is a small coordinated group (2–8 players).
-- Party leader can set collective goals; individual XP still accrues.
CREATE TABLE IF NOT EXISTS public.parties (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  description   TEXT,
  emblem        TEXT        DEFAULT '⚔',       -- emoji or icon key
  leader_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_members   INTEGER     NOT NULL DEFAULT 6 CHECK (max_members BETWEEN 2 AND 8),
  aura_pool     INTEGER     NOT NULL DEFAULT 0 CHECK (aura_pool >= 0), -- collective Aura
  xp_pool       INTEGER     NOT NULL DEFAULT 0 CHECK (xp_pool >= 0),   -- sum of member XP
  is_recruiting BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parties_leader ON public.parties(leader_id);
CREATE INDEX IF NOT EXISTS idx_parties_recruiting ON public.parties(is_recruiting);

ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read parties" ON public.parties;
CREATE POLICY "Public can read parties" ON public.parties FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Leader can update party" ON public.parties;
CREATE POLICY "Leader can update party" ON public.parties FOR UPDATE USING (auth.uid() = leader_id);
DROP POLICY IF EXISTS "Authenticated can create party" ON public.parties;
CREATE POLICY "Authenticated can create party" ON public.parties FOR INSERT WITH CHECK (auth.uid() = leader_id);


-- ── 2. PARTY MEMBERS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.party_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id   UUID        NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role = ANY(ARRAY['leader','officer','member'])),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (party_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_party_members_user ON public.party_members(user_id);
CREATE INDEX IF NOT EXISTS idx_party_members_party ON public.party_members(party_id);

ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all party members" ON public.party_members;
CREATE POLICY "Users can view all party members" ON public.party_members FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Users can leave parties" ON public.party_members;
CREATE POLICY "Users can leave parties" ON public.party_members FOR DELETE USING (auth.uid() = user_id);


-- ── 3. PARTY QUESTS (shared objectives) ───────────────────────
CREATE TABLE IF NOT EXISTS public.party_quests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id       UUID        NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  target_count   INTEGER     NOT NULL DEFAULT 1,   -- How many completions needed
  current_count  INTEGER     NOT NULL DEFAULT 0,
  xp_pool_reward INTEGER     NOT NULL DEFAULT 500 CHECK (xp_pool_reward >= 0),
  status         TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status = ANY(ARRAY['active','completed','expired'])),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_quests_party ON public.party_quests(party_id);

ALTER TABLE public.party_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Party members can read party quests" ON public.party_quests;
CREATE POLICY "Party members can read party quests"
      ON public.party_quests FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.party_members
        WHERE party_id = party_quests.party_id AND user_id = auth.uid()
      ));


-- ── 4. AURA SINKS (Marketplace items) ─────────────────────────
-- Players spend Aura on cosmetic / utility perks.
-- All items are economy sinks — they remove Aura from circulation.
CREATE TABLE IF NOT EXISTS public.store_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  category     TEXT        NOT NULL DEFAULT 'cosmetic'
                            CHECK (category = ANY(ARRAY['cosmetic','boost','title','party'])),
  aura_cost    INTEGER     NOT NULL CHECK (aura_cost > 0),
  icon         TEXT        DEFAULT '✦',
  is_available BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Optional metadata (JSON) for effects: {"duration_days": 7, "xp_multiplier": 1.5}
  effect_meta  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view store items" ON public.store_items;
CREATE POLICY "Anyone can view store items" ON public.store_items FOR SELECT USING (TRUE);


-- ── 5. USER PURCHASES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_purchases (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_id      UUID        NOT NULL REFERENCES public.store_items(id),
  aura_spent   INTEGER     NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ             -- NULL = permanent
);

CREATE INDEX IF NOT EXISTS idx_user_purchases_user ON public.user_purchases(user_id);

ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own purchases" ON public.user_purchases;
CREATE POLICY "Users manage own purchases"
      ON public.user_purchases FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);


-- ── 6. RPC: purchase_item ─────────────────────────────────────
-- Atomic purchase: deducts Aura, inserts purchase record, logs sink.
CREATE OR REPLACE FUNCTION public.purchase_store_item(
  p_user_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item        RECORD;
  v_user_aura   INTEGER;
  v_expires     TIMESTAMPTZ;
BEGIN
  -- Lock and fetch item
  SELECT * INTO v_item FROM public.store_items WHERE id = p_item_id AND is_available = TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Item not found or unavailable');
  END IF;

  -- Get user's current Aura
  SELECT aura INTO v_user_aura FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_user_aura < v_item.aura_cost THEN
    RETURN jsonb_build_object('error', 'Insufficient Aura', 'have', v_user_aura, 'need', v_item.aura_cost);
  END IF;

  -- Compute expiry (if item has duration_days in effect_meta)
  IF v_item.effect_meta ? 'duration_days' THEN
    v_expires := now() + (v_item.effect_meta->>'duration_days')::INTEGER * INTERVAL '1 day';
  END IF;

  -- Deduct Aura
  UPDATE public.profiles
  SET    aura = aura - v_item.aura_cost
  WHERE  id = p_user_id;

  -- Record purchase
  INSERT INTO public.user_purchases (user_id, item_id, aura_spent, expires_at)
  VALUES (p_user_id, p_item_id, v_item.aura_cost, v_expires);

  -- Log aura sink
  INSERT INTO public.aura_log (user_id, delta, reason)
  VALUES (p_user_id, -v_item.aura_cost, 'store_purchase:' || v_item.name);

  RETURN jsonb_build_object(
    'success', TRUE,
    'item',    v_item.name,
    'spent',   v_item.aura_cost,
    'expires', v_expires
  );
END;
$$;


-- ── 7. SEED: Store items ───────────────────────────────────────
INSERT INTO public.store_items (name, description, category, aura_cost, icon, effect_meta) VALUES
  ('Title: The Focused',    'Display title for reaching 10 focus sessions.',  'title',    50,   '🎯', NULL),
  ('Title: Jury Master',    'Display title for 20+ accurate jury votes.',      'title',    80,   '⚖',  NULL),
  ('Streak Shield',         'Protect your streak for one missed day.',         'boost',    120,  '🛡',  '{"duration_days": 1}'),
  ('XP Surge (24h)',        'Gain 1.5× XP from all sources for 24 hours.',    'boost',    200,  '⚡',  '{"duration_days": 1, "xp_multiplier": 1.5}'),
  ('Party Banner',          'Custom banner for your party page.',              'party',    150,  '🏴',  NULL),
  ('Classic Theme Unlock',  'Permanent access to the Classic neon theme.',     'cosmetic', 100,  '🌌', NULL)
ON CONFLICT DO NOTHING;
