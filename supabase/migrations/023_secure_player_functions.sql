-- ============================================================
-- Migration 023: Secure functions — identity, economy, daily systems
--
-- RULES every function in this file follows (easy to explain):
--   1. SECURITY DEFINER + SET search_path = public, pg_temp
--        -> runs with the owner's rights, and nobody can trick it into
--           using a fake table/function placed in another schema.
--   2. WHO is acting comes from auth.uid() (the verified login),
--      NEVER from a parameter. No "p_user_id" for user-callable functions.
--   3. Inputs are validated; values are bounded.
--   4. EXECUTE is revoked from everyone, then granted to exactly the
--      role that needs it (see the GRANT section at the bottom).
--   5. To avoid race conditions we LOCK the player's profile row first
--      ("SELECT ... FOR UPDATE"), then check, then write.
--      LOCK ORDER (prevents deadlocks): user_quests row first, then profiles.
--
-- Functions starting with "_" are internal helpers. Clients can NOT call
-- them; only other functions in this database can.
-- ============================================================

-- ── Remove the old, unsafe versions completely ───────────────
DROP FUNCTION IF EXISTS public.deduct_aura(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS public.grant_quest_rewards(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.grant_temporary_luck(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.update_streak(UUID);
DROP FUNCTION IF EXISTS public.roll_daily_luck(UUID);
DROP FUNCTION IF EXISTS public.purchase_store_item(UUID, UUID);
DROP FUNCTION IF EXISTS public.complete_private_quest(UUID, UUID);
DROP FUNCTION IF EXISTS public.submit_daily_log(UUID, TEXT);

-- ============================================================
-- INTERNAL HELPERS
-- ============================================================

-- Who is calling? Returns the logged-in user's id, or raises an error
-- for anonymous or banned accounts. Used at the top of every
-- user-callable function that changes something.
CREATE OR REPLACE FUNCTION public._current_player()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_banned BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT is_banned INTO v_banned FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_banned THEN
    RAISE EXCEPTION 'this account is banned' USING ERRCODE = '42501';
  END IF;

  RETURN v_uid;
END;
$$;

-- Lock this player's profile row until the end of the transaction.
-- Two requests from the same player now run one after the other, which
-- is what makes "check, then write" safe (e.g. daily limits).
CREATE OR REPLACE FUNCTION public._lock_player(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
$$;

-- The ONLY way XP/Aura go up. Values are bounded so a bug or bad input
-- can never mint a huge or negative amount.
CREATE OR REPLACE FUNCTION public._grant_rewards(
  p_user_id UUID,
  p_xp      INT,
  p_aura    INT,
  p_reason  TEXT DEFAULT 'quest_complete'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > 5000 THEN
    RAISE EXCEPTION 'xp reward out of range: %', p_xp;
  END IF;
  IF p_aura IS NULL OR p_aura < 0 OR p_aura > 500 THEN
    RAISE EXCEPTION 'aura reward out of range: %', p_aura;
  END IF;

  UPDATE public.profiles
  SET xp = xp + p_xp, aura = aura + p_aura
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  IF p_aura > 0 THEN
    INSERT INTO public.aura_log (user_id, delta, reason) VALUES (p_user_id, p_aura, p_reason);
  END IF;
END;
$$;

-- The ONLY way Aura goes down. Never goes below 0, and the log records
-- what was REALLY taken (the old version logged the requested amount
-- even when the balance was too low).
CREATE OR REPLACE FUNCTION public._deduct_aura(
  p_user_id UUID,
  p_amount  INT,
  p_reason  TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old   INT;
  v_taken INT;
BEGIN
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 500 THEN
    RAISE EXCEPTION 'aura deduction out of range: %', p_amount;
  END IF;
  IF p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid reason';
  END IF;

  SELECT aura INTO v_old FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  v_taken := LEAST(v_old, p_amount);
  UPDATE public.profiles SET aura = aura - v_taken WHERE id = p_user_id;

  IF v_taken > 0 THEN
    INSERT INTO public.aura_log (user_id, delta, reason) VALUES (p_user_id, -v_taken, p_reason);
  END IF;

  RETURN v_old - v_taken;
END;
$$;

-- Temporary luck for the next critical-hit roll. Capped at 50 so it can
-- never pile up without limit.
CREATE OR REPLACE FUNCTION public._add_luck_boost(p_user_id UUID, p_amount INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 20 THEN
    RAISE EXCEPTION 'luck boost out of range: %', p_amount;
  END IF;

  UPDATE public.profiles
  SET active_luck_boost = LEAST(50, COALESCE(active_luck_boost, 0) + p_amount)
  WHERE id = p_user_id;
END;
$$;

-- ============================================================
-- SIGN-UP TRIGGERS (not callable by clients)
-- ============================================================

-- Creates the profile when someone signs up. The username comes from
-- user-supplied metadata, so we clean it and make it unique instead of
-- failing the whole sign-up on a name clash.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base TEXT;
  v_name TEXT;
BEGIN
  v_base := lower(COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1), ''));
  v_base := left(regexp_replace(v_base, '[^a-z0-9_]', '_', 'g'), 20);
  IF char_length(v_base) < 3 THEN
    v_base := 'player_' || substr(md5(random()::text), 1, 6);
  END IF;

  v_name := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_name) LOOP
    v_name := left(v_base, 15) || '_' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.profiles (id, username) VALUES (NEW.id, v_name);
  RETURN NEW;
END;
$$;

-- Level formula from 017, unchanged. Only added a fixed search_path.
CREATE OR REPLACE FUNCTION public.update_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.level = FLOOR(1 + SQRT(NEW.xp::FLOAT / 100));
  RETURN NEW;
END;
$$;

-- ============================================================
-- DAILY SYSTEMS
-- ============================================================

-- Daily login reward + streak. Safe to call on every page load:
-- it only pays out once per day.
CREATE OR REPLACE FUNCTION public.update_streak()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         UUID := public._current_player();
  v_last_active DATE;
  v_streak      INT;
  v_today       DATE := CURRENT_DATE;
BEGIN
  SELECT last_active, streak_days INTO v_last_active, v_streak
  FROM public.profiles WHERE id = v_uid FOR UPDATE;       -- lock: no double payout

  IF v_last_active = v_today THEN
    RETURN;                                               -- already paid today
  ELSIF v_last_active = v_today - 1 THEN
    v_streak := v_streak + 1;                             -- consecutive day
  ELSE
    v_streak := 1;                                        -- streak restarts
  END IF;

  UPDATE public.profiles
  SET streak_days = v_streak, last_active = v_today
  WHERE id = v_uid;

  PERFORM public._grant_rewards(v_uid, 50, 10, 'daily_login');

  IF v_streak % 7 = 0 THEN
    PERFORM public._grant_rewards(v_uid, 0, 50, 'streak_bonus');
  END IF;
END;
$$;

-- Daily luck roll (algorithm unchanged from 011). One roll per day.
CREATE OR REPLACE FUNCTION public.roll_daily_luck()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            UUID := public._current_player();
  v_existing       JSONB;
  v_yesterday_luck INT;
  v_today_luck     INT;
  v_is_grind_day   BOOLEAN;
BEGIN
  PERFORM public._lock_player(v_uid);

  SELECT jsonb_build_object('luck_value', luck_value, 'is_grind_day', is_grind_day)
  INTO v_existing
  FROM public.daily_luck_rolls
  WHERE user_id = v_uid AND roll_date = CURRENT_DATE;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT luck_value INTO v_yesterday_luck
  FROM public.daily_luck_rolls
  WHERE user_id = v_uid AND roll_date = CURRENT_DATE - 1;

  IF v_yesterday_luck IS NULL THEN
    SELECT COALESCE(luck, 50) INTO v_yesterday_luck FROM public.profiles WHERE id = v_uid;
  END IF;

  -- Inverse engine: a lucky day makes tomorrow harder, and vice versa.
  v_today_luck   := LEAST(90, GREATEST(10, 100 - v_yesterday_luck + (floor(random() * 31)::INT - 15)));
  v_is_grind_day := v_today_luck <= 40;

  INSERT INTO public.daily_luck_rolls (user_id, roll_date, luck_value, is_grind_day)
  VALUES (v_uid, CURRENT_DATE, v_today_luck, v_is_grind_day);

  RETURN jsonb_build_object('luck_value', v_today_luck, 'is_grind_day', v_is_grind_day);
END;
$$;

-- One Daily Discovery per day. The luck amount is fixed here, not
-- chosen by the caller.
CREATE OR REPLACE FUNCTION public.claim_daily_discovery(p_image_ref TEXT, p_summary TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := public._current_player();
  v_luck CONSTANT INT := 10;
BEGIN
  IF p_image_ref IS NULL OR char_length(p_image_ref) NOT BETWEEN 1 AND 500
     OR p_summary IS NULL OR char_length(p_summary) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid discovery input';
  END IF;

  PERFORM public._lock_player(v_uid);

  IF EXISTS (SELECT 1 FROM public.daily_discoveries
             WHERE user_id = v_uid AND created_at >= CURRENT_DATE) THEN
    RETURN jsonb_build_object('error', 'limit_reached');
  END IF;

  INSERT INTO public.daily_discoveries (user_id, image_url, analysis_summary, luck_granted)
  VALUES (v_uid, p_image_ref, p_summary, v_luck);

  PERFORM public._add_luck_boost(v_uid, v_luck);

  RETURN jsonb_build_object('success', TRUE, 'analysis_summary', p_summary, 'luck_granted', v_luck);
END;
$$;

-- Focus-jail violation: a FIXED 5 Aura penalty. (The old API let the
-- caller choose any amount and any reason text.)
CREATE OR REPLACE FUNCTION public.report_focus_violation()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._deduct_aura(public._current_player(), 5, 'focus_violation');
END;
$$;

-- ── Diary / journal ─────────────────────────────────────────
-- Dailies page: one editable entry per day, no XP.
CREATE OR REPLACE FUNCTION public.save_daily_entry(p_entry TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := public._current_player();
  v_entry TEXT := btrim(COALESCE(p_entry, ''));
  v_id    UUID;
BEGIN
  IF char_length(v_entry) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'entry must be 1-2000 characters';
  END IF;

  PERFORM public._lock_player(v_uid);

  SELECT id INTO v_id FROM public.daily_logs
  WHERE user_id = v_uid AND created_at >= CURRENT_DATE
  ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.daily_logs (user_id, entry) VALUES (v_uid, v_entry) RETURNING id INTO v_id;
  ELSE
    UPDATE public.daily_logs SET entry = v_entry WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Journal page: any number of entries; the first one of the day earns +25 XP.
CREATE OR REPLACE FUNCTION public.submit_daily_log(p_entry TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := public._current_player();
  v_entry TEXT := btrim(COALESCE(p_entry, ''));
  v_first BOOLEAN;
  v_xp    INT;
BEGIN
  IF char_length(v_entry) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'entry must be 1-2000 characters';
  END IF;

  PERFORM public._lock_player(v_uid);

  v_first := NOT EXISTS (SELECT 1 FROM public.daily_logs
                         WHERE user_id = v_uid AND created_at >= CURRENT_DATE AND xp_awarded > 0);
  v_xp := CASE WHEN v_first THEN 25 ELSE 0 END;

  INSERT INTO public.daily_logs (user_id, entry, xp_awarded) VALUES (v_uid, v_entry, v_xp);
  IF v_xp > 0 THEN
    PERFORM public._grant_rewards(v_uid, v_xp, 0, 'daily_log');
  END IF;

  RETURN jsonb_build_object('xp_awarded', v_xp, 'first_entry', v_first);
END;
$$;

-- ============================================================
-- STORE
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_store_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     UUID := public._current_player();
  v_item    RECORD;
  v_aura    INT;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_item FROM public.store_items WHERE id = p_item_id AND is_available = TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Item not found or unavailable');
  END IF;

  SELECT aura INTO v_aura FROM public.profiles WHERE id = v_uid FOR UPDATE;   -- lock balance
  IF v_aura < v_item.aura_cost THEN
    RETURN jsonb_build_object('error', 'Insufficient Aura', 'have', v_aura, 'need', v_item.aura_cost);
  END IF;

  IF v_item.effect_meta ? 'duration_days' THEN
    v_expires := now() + (v_item.effect_meta ->> 'duration_days')::INT * INTERVAL '1 day';
  END IF;

  UPDATE public.profiles SET aura = aura - v_item.aura_cost WHERE id = v_uid;

  INSERT INTO public.user_purchases (user_id, item_id, aura_spent, expires_at)
  VALUES (v_uid, p_item_id, v_item.aura_cost, v_expires);

  INSERT INTO public.aura_log (user_id, delta, reason)
  VALUES (v_uid, -v_item.aura_cost, 'store_purchase:' || v_item.name);

  RETURN jsonb_build_object('success', TRUE, 'item', v_item.name, 'spent', v_item.aura_cost, 'expires', v_expires);
END;
$$;

-- ============================================================
-- PRIVATE QUESTS (self-set goals, honour system)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_private_quest(
  p_title            TEXT,
  p_description      TEXT,
  p_skill_type       TEXT,
  p_xp_reward        INT,
  p_duration_minutes INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := public._current_player();
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_desc  TEXT := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_id    UUID;
BEGIN
  IF char_length(v_title) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'title must be 1-80 characters'; END IF;
  IF v_desc IS NOT NULL AND char_length(v_desc) > 300 THEN RAISE EXCEPTION 'description too long (max 300)'; END IF;
  IF p_skill_type IS NULL OR p_skill_type NOT IN ('focus', 'coding', 'fitness', 'creative') THEN
    RAISE EXCEPTION 'invalid skill type';
  END IF;
  IF p_xp_reward IS NULL OR p_xp_reward NOT BETWEEN 10 AND 200 THEN RAISE EXCEPTION 'xp must be 10-200'; END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 1 AND 720 THEN
    RAISE EXCEPTION 'duration must be 1-720 minutes';
  END IF;

  PERFORM public._lock_player(v_uid);

  IF (SELECT COUNT(*) FROM public.private_quests WHERE user_id = v_uid AND status = 'active') >= 30 THEN
    RAISE EXCEPTION 'too many active private quests (max 30)';
  END IF;

  -- aura_reward is not settable: private quests only ever pay XP.
  INSERT INTO public.private_quests (user_id, title, description, skill_type, xp_reward, aura_reward, duration_minutes, status)
  VALUES (v_uid, v_title, v_desc, p_skill_type, p_xp_reward, 0, p_duration_minutes, 'active')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Completing a private quest. Rule (unchanged from 014): at most 500 XP
-- per day comes from private quests.
CREATE OR REPLACE FUNCTION public.complete_private_quest(p_quest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          UUID := public._current_player();
  v_quest_xp     INT;
  v_quest_aura   INT;
  v_status       TEXT;
  v_today_xp     INT;
  v_cap          CONSTANT INT := 500;
  v_awarded_xp   INT := 0;
  v_awarded_aura INT := 0;
BEGIN
  SELECT xp_reward, aura_reward, status INTO v_quest_xp, v_quest_aura, v_status
  FROM public.private_quests
  WHERE id = p_quest_id AND user_id = v_uid          -- ownership check
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quest not found';
  END IF;
  IF v_status <> 'active' THEN
    RETURN;                                          -- already done (safe to call twice)
  END IF;

  PERFORM public._lock_player(v_uid);                -- serialise the daily-cap check

  SELECT COALESCE(SUM(xp_reward), 0) INTO v_today_xp
  FROM public.private_quests
  WHERE user_id = v_uid AND status = 'completed' AND completed_at >= CURRENT_DATE;

  IF v_today_xp < v_cap THEN
    v_awarded_xp   := LEAST(v_quest_xp, v_cap - v_today_xp);
    v_awarded_aura := v_quest_aura;
  END IF;

  UPDATE public.private_quests SET status = 'completed', completed_at = now() WHERE id = p_quest_id;

  IF v_awarded_xp > 0 OR v_awarded_aura > 0 THEN
    PERFORM public._grant_rewards(v_uid, v_awarded_xp, v_awarded_aura, 'private_quest');
  END IF;
END;
$$;

-- ============================================================
-- PARTIES
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_party(
  p_name        TEXT,
  p_description TEXT,
  p_emblem      TEXT,
  p_max_members INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := public._current_player();
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_desc TEXT := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_id   UUID;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'party name must be 1-40 characters'; END IF;
  IF v_desc IS NOT NULL AND char_length(v_desc) > 200 THEN RAISE EXCEPTION 'description too long (max 200)'; END IF;
  IF p_emblem IS NULL OR char_length(p_emblem) NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'invalid emblem'; END IF;
  IF p_max_members IS NULL OR p_max_members NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'max members must be 2-8'; END IF;

  PERFORM public._lock_player(v_uid);

  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'you are already in a party';
  END IF;

  -- Pools start at 0. Clients can no longer choose them.
  INSERT INTO public.parties (name, description, emblem, leader_id, max_members)
  VALUES (v_name, v_desc, p_emblem, v_uid, p_max_members)
  RETURNING id INTO v_id;                                  -- duplicate name -> unique violation

  INSERT INTO public.party_members (party_id, user_id, role) VALUES (v_id, v_uid, 'leader');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party(p_party_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := public._current_player();
  v_party RECORD;
BEGIN
  PERFORM public._lock_player(v_uid);

  IF EXISTS (SELECT 1 FROM public.party_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'you are already in a party';
  END IF;

  SELECT id, max_members, is_recruiting INTO v_party
  FROM public.parties WHERE id = p_party_id FOR UPDATE;   -- lock: capacity check is race-safe
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;
  IF NOT v_party.is_recruiting THEN RAISE EXCEPTION 'this party is not recruiting'; END IF;
  IF (SELECT COUNT(*) FROM public.party_members WHERE party_id = p_party_id) >= v_party.max_members THEN
    RAISE EXCEPTION 'this party is full';
  END IF;

  INSERT INTO public.party_members (party_id, user_id, role) VALUES (p_party_id, v_uid, 'member');
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_party()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  UUID := public._current_player();
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.party_members WHERE user_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_role = 'leader' THEN
    RAISE EXCEPTION 'a party leader cannot leave their party';   -- same rule as the UI
  END IF;
  DELETE FROM public.party_members WHERE user_id = v_uid;
END;
$$;

-- ============================================================
-- PERMISSIONS: nobody by default, then exactly what is needed
-- ============================================================
REVOKE ALL ON FUNCTION
  public._current_player(), public._lock_player(UUID),
  public._grant_rewards(UUID, INT, INT, TEXT), public._deduct_aura(UUID, INT, TEXT),
  public._add_luck_boost(UUID, INT),
  public.handle_new_user(), public.update_level(), public.block_aura_log_changes(),
  public.update_streak(), public.roll_daily_luck(), public.claim_daily_discovery(TEXT, TEXT),
  public.report_focus_violation(), public.save_daily_entry(TEXT), public.submit_daily_log(TEXT),
  public.purchase_store_item(UUID),
  public.create_private_quest(TEXT, TEXT, TEXT, INT, INT), public.complete_private_quest(UUID),
  public.create_party(TEXT, TEXT, TEXT, INT), public.join_party(UUID), public.leave_party()
FROM PUBLIC, anon, authenticated;

-- The public API a logged-in browser may call. (Helpers "_x" and the
-- triggers are deliberately NOT in this list.)
GRANT EXECUTE ON FUNCTION
  public.update_streak(), public.roll_daily_luck(), public.claim_daily_discovery(TEXT, TEXT),
  public.report_focus_violation(), public.save_daily_entry(TEXT), public.submit_daily_log(TEXT),
  public.purchase_store_item(UUID),
  public.create_private_quest(TEXT, TEXT, TEXT, INT, INT), public.complete_private_quest(UUID),
  public.create_party(TEXT, TEXT, TEXT, INT), public.join_party(UUID), public.leave_party()
TO authenticated;
