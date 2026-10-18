-- ============================================================
-- Migration 024: Secure functions — quests, jury, admin
--
-- Same rules as 023 (identity from auth.uid(), fixed search_path,
-- validated input, minimal EXECUTE grants).
--
-- JURY RULES (this is the "spec" the tests check):
--   * Only submissions in status 'pending_verification' can be voted on.
--   * You cannot vote on your own submission.
--   * You need at least 100 Aura to be a juror (SYSTEM_DESIGN.md says so).
--   * One vote per juror per submission (UNIQUE constraint from 001).
--   * Your vote weight is your Aura, read from the database at vote time
--     — a client can never send its own weight.
--   * QUORUM: nothing is decided until at least 3 votes exist.
--   * VERDICT = (Aura of approvers) / (Aura of all voters)
--       >= 0.60  -> approved   (rewards the submitter)
--       <  0.40  -> rejected   (-20 Aura for the submitter)
--       between  -> "inconclusive": stays pending; the next vote
--                   re-evaluates it. (An admin can also settle it.)
--   * Deciding happens exactly once: resolving a submission that is
--     already decided does nothing (idempotent), and the submission row
--     is locked while it is decided so parallel votes cannot double-pay.
-- ============================================================

DROP FUNCTION IF EXISTS public.start_quest(UUID, UUID);
DROP FUNCTION IF EXISTS public.submit_quest_proof(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_jury_pool(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.resolve_verdict(UUID);

-- ============================================================
-- QUEST LIFECYCLE
-- ============================================================

-- Start (or resume) a quest. Allowed transitions:
--   no row / idle / failed -> active   (a failed quest can be retried)
--   active                 -> active   (resume, nothing changes)
-- A quest that is pending review or already completed can NOT be restarted;
-- before, restarting kept the old votes and allowed a free second payout.
CREATE OR REPLACE FUNCTION public.start_quest(p_quest_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := public._current_player();
  v_uq_id  UUID;
  v_status TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quests WHERE id = p_quest_id) THEN
    RAISE EXCEPTION 'quest not found';
  END IF;

  SELECT id, status INTO v_uq_id, v_status
  FROM public.user_quests
  WHERE user_id = v_uid AND quest_id = p_quest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_quests (user_id, quest_id, status, started_at)
    VALUES (v_uid, p_quest_id, 'active', now())
    ON CONFLICT (user_id, quest_id) DO NOTHING
    RETURNING id INTO v_uq_id;

    IF v_uq_id IS NULL THEN                       -- a parallel request created it first
      SELECT id INTO v_uq_id FROM public.user_quests
      WHERE user_id = v_uid AND quest_id = p_quest_id;
    END IF;

  ELSIF v_status IN ('idle', 'failed') THEN
    DELETE FROM public.jury_votes WHERE user_quest_id = v_uq_id;   -- new attempt = fresh jury
    UPDATE public.user_quests
    SET status = 'active', started_at = now(), proof_url = NULL, proof_submitted_at = NULL,
        jury_verdict = NULL, completed_at = NULL
    WHERE id = v_uq_id;

  ELSIF v_status <> 'active' THEN
    RAISE EXCEPTION 'this quest is already submitted or completed';
  END IF;

  RETURN v_uq_id;
END;
$$;

-- Give up on a quest you have not submitted yet.
CREATE OR REPLACE FUNCTION public.abandon_quest(p_user_quest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := public._current_player();
BEGIN
  DELETE FROM public.user_quests
  WHERE id = p_user_quest_id AND user_id = v_uid AND status IN ('idle', 'active', 'failed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quest cannot be abandoned';
  END IF;
END;
$$;

-- Hand in proof. Checks: you own the quest, it is active, and the file
-- really exists inside YOUR folder of the private bucket.
CREATE OR REPLACE FUNCTION public.submit_quest_proof(p_user_quest_id UUID, p_proof_path TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    UUID := public._current_player();
  v_status TEXT;
BEGIN
  -- Expected shape: {your user id}/{uuid}.{jpg|jpeg|png|webp|gif}
  IF p_proof_path IS NULL
     OR p_proof_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$') THEN
    RAISE EXCEPTION 'invalid proof path';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'submissions' AND name = p_proof_path) THEN
    RAISE EXCEPTION 'proof file not found in storage';
  END IF;

  SELECT status INTO v_status
  FROM public.user_quests
  WHERE id = p_user_quest_id AND user_id = v_uid          -- ownership check
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quest not found'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'quest is not active'; END IF;

  UPDATE public.user_quests
  SET status = 'pending_verification', proof_url = p_proof_path, proof_submitted_at = now()
  WHERE id = p_user_quest_id;
END;
$$;

-- ============================================================
-- JURY
-- ============================================================

-- The list of submissions the caller may vote on. Returns only safe
-- fields (no user ids, no storage paths). Empty if the caller is not
-- eligible (fewer than 100 Aura, banned, or not logged in).
CREATE OR REPLACE FUNCTION public.get_jury_queue()
RETURNS TABLE (
  user_quest_id      UUID,
  quest_id           UUID,
  title              TEXT,
  description        TEXT,
  difficulty         TEXT,
  skill_type         TEXT,
  xp_reward          INT,
  aura_reward        INT,
  submitter_username TEXT,
  submitter_level    INT,
  submitted_at       TIMESTAMPTZ,
  has_proof          BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT uq.id, q.id, q.title, q.description, q.difficulty, q.skill_type,
         q.xp_reward, q.aura_reward, s.username, s.level, uq.proof_submitted_at,
         (uq.proof_url IS NOT NULL)
  FROM public.user_quests uq
  JOIN public.quests   q ON q.id = uq.quest_id
  JOIN public.profiles s ON s.id = uq.user_id
  JOIN public.profiles me ON me.id = auth.uid() AND me.aura >= 100 AND NOT me.is_banned
  WHERE uq.status = 'pending_verification'
    AND uq.user_id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.jury_votes v
                    WHERE v.user_quest_id = uq.id AND v.juror_id = auth.uid())
  ORDER BY uq.proof_submitted_at ASC NULLS LAST;
$$;

-- Which storage file may the caller look at? The owner may view their own
-- proof; an eligible juror may view a pending submission by someone else.
-- Used by the server (which then creates a short-lived signed URL).
CREATE OR REPLACE FUNCTION public.get_proof_path_for_viewer(p_user_quest_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   UUID := public._current_player();
  v_owner UUID;
  v_path  TEXT;
  v_stat  TEXT;
  v_aura  INT;
BEGIN
  SELECT user_id, proof_url, status INTO v_owner, v_path, v_stat
  FROM public.user_quests WHERE id = p_user_quest_id;
  IF NOT FOUND OR v_path IS NULL THEN RETURN NULL; END IF;

  IF v_owner = v_uid THEN RETURN v_path; END IF;

  SELECT aura INTO v_aura FROM public.profiles WHERE id = v_uid;
  IF v_stat = 'pending_verification' AND v_aura >= 100 THEN RETURN v_path; END IF;

  RETURN NULL;
END;
$$;

-- Decide a submission. INTERNAL: only called by cast_jury_vote.
-- Safe to call repeatedly: once decided, it returns 'already_resolved'
-- without paying anything.
CREATE OR REPLACE FUNCTION public._resolve_verdict(p_user_quest_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status      TEXT;
  v_submitter   UUID;
  v_xp          INT;
  v_aura        INT;
  v_votes       INT;
  v_verdict     NUMERIC;
  v_luck        INT;
  v_boost       INT;
  v_critical    BOOLEAN := FALSE;
  v_result      TEXT;
  v_juror       RECORD;
BEGIN
  -- Lock the submission row: parallel votes now line up one by one.
  SELECT uq.status, uq.user_id, q.xp_reward, q.aura_reward
  INTO v_status, v_submitter, v_xp, v_aura
  FROM public.user_quests uq
  JOIN public.quests q ON q.id = uq.quest_id
  WHERE uq.id = p_user_quest_id
  FOR UPDATE OF uq;

  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
  IF v_status <> 'pending_verification' THEN RETURN 'already_resolved'; END IF;

  SELECT COUNT(*) INTO v_votes FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;
  IF v_votes < 3 THEN RETURN 'insufficient_votes'; END IF;      -- quorum

  -- Aura-weighted approval share, 0..1
  SELECT COALESCE(SUM(CASE WHEN vote THEN juror_aura_snapshot ELSE 0 END)::NUMERIC
                  / NULLIF(SUM(juror_aura_snapshot), 0), 0.5)
  INTO v_verdict
  FROM public.jury_votes WHERE user_quest_id = p_user_quest_id;

  IF v_verdict >= 0.6 THEN
    -- Critical hit: chance = luck + temporary boost (percent), x1.5 XP.
    SELECT COALESCE(luck, 50), COALESCE(active_luck_boost, 0) INTO v_luck, v_boost
    FROM public.profiles WHERE id = v_submitter FOR UPDATE;
    UPDATE public.profiles SET active_luck_boost = 0 WHERE id = v_submitter;   -- boost is used up

    v_critical := random() * 100 < (v_luck + v_boost);
    IF v_critical THEN v_xp := floor(v_xp * 1.5); END IF;

    UPDATE public.user_quests
    SET status = CASE WHEN v_critical THEN 'completed_critical' ELSE 'completed' END,
        jury_verdict = v_verdict, completed_at = now()
    WHERE id = p_user_quest_id;

    PERFORM public._grant_rewards(v_submitter, v_xp, v_aura, 'quest_complete');
    UPDATE public.jury_votes SET verdict_match = (vote = TRUE) WHERE user_quest_id = p_user_quest_id;
    v_result := CASE WHEN v_critical THEN 'approved_critical' ELSE 'approved' END;

  ELSIF v_verdict < 0.4 THEN
    UPDATE public.user_quests SET status = 'failed', jury_verdict = v_verdict WHERE id = p_user_quest_id;
    PERFORM public._deduct_aura(v_submitter, 20, 'jury_rejection');
    UPDATE public.jury_votes SET verdict_match = (vote = FALSE) WHERE user_quest_id = p_user_quest_id;
    v_result := 'rejected';

  ELSE
    RETURN 'inconclusive';          -- stays pending, next vote re-evaluates
  END IF;

  -- Jurors who agreed with the final verdict get +10 XP, +2 Aura.
  FOR v_juror IN
    SELECT juror_id FROM public.jury_votes WHERE user_quest_id = p_user_quest_id AND verdict_match = TRUE
  LOOP
    PERFORM public._grant_rewards(v_juror.juror_id, 10, 2, 'jury_bonus');
  END LOOP;

  RETURN v_result;
END;
$$;

-- Cast a vote. This is the ONLY way a vote gets recorded.
CREATE OR REPLACE FUNCTION public.cast_jury_vote(p_user_quest_id UUID, p_vote BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       UUID := public._current_player();
  v_owner     UUID;
  v_status    TEXT;
  v_aura      INT;
  v_min_aura  CONSTANT INT := 100;
  v_resolution TEXT;
BEGIN
  IF p_vote IS NULL THEN RAISE EXCEPTION 'vote must be true or false'; END IF;

  -- Lock the submission first (lock order: user_quests, then profiles).
  SELECT user_id, status INTO v_owner, v_status
  FROM public.user_quests WHERE id = p_user_quest_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;

  IF v_owner = v_uid THEN RAISE EXCEPTION 'you cannot vote on your own submission'; END IF;
  IF v_status <> 'pending_verification' THEN RAISE EXCEPTION 'this submission is no longer pending verification'; END IF;

  SELECT aura INTO v_aura FROM public.profiles WHERE id = v_uid;
  IF v_aura < v_min_aura THEN
    RAISE EXCEPTION 'you need at least % Aura to be a juror', v_min_aura;
  END IF;

  -- A second vote by the same juror raises unique_violation (23505).
  INSERT INTO public.jury_votes (user_quest_id, juror_id, vote, juror_aura_snapshot)
  VALUES (p_user_quest_id, v_uid, p_vote, v_aura);

  v_resolution := public._resolve_verdict(p_user_quest_id);

  RETURN jsonb_build_object('weight', v_aura, 'resolution', v_resolution);
END;
$$;

-- ============================================================
-- ADMIN (service role only — the Next.js server calls these AFTER it
-- has verified the caller's role in the database)
-- ============================================================

CREATE OR REPLACE FUNCTION public._assert_admin(p_admin_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin' AND NOT is_banned) THEN
    RAISE EXCEPTION 'not an admin' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Settle a pending submission by hand: approve | reject | penalize.
CREATE OR REPLACE FUNCTION public.admin_resolve_submission(
  p_admin_id UUID, p_user_quest_id UUID, p_action TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status    TEXT;
  v_submitter UUID;
  v_xp        INT;
  v_aura      INT;
BEGIN
  PERFORM public._assert_admin(p_admin_id);
  IF p_action NOT IN ('approve', 'reject', 'penalize') THEN RAISE EXCEPTION 'invalid action'; END IF;

  SELECT uq.status, uq.user_id, q.xp_reward, q.aura_reward INTO v_status, v_submitter, v_xp, v_aura
  FROM public.user_quests uq JOIN public.quests q ON q.id = uq.quest_id
  WHERE uq.id = p_user_quest_id FOR UPDATE OF uq;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found'; END IF;
  IF v_status <> 'pending_verification' THEN RAISE EXCEPTION 'submission is not pending'; END IF;

  IF p_action = 'approve' THEN
    UPDATE public.user_quests SET status = 'completed', jury_verdict = 1, completed_at = now() WHERE id = p_user_quest_id;
    PERFORM public._grant_rewards(v_submitter, v_xp, v_aura, 'quest_complete');
  ELSIF p_action = 'reject' THEN
    UPDATE public.user_quests SET status = 'failed', jury_verdict = 0 WHERE id = p_user_quest_id;
    PERFORM public._deduct_aura(v_submitter, 10, 'admin_rejection');
  ELSE
    UPDATE public.user_quests SET status = 'failed', jury_verdict = -1 WHERE id = p_user_quest_id;
    PERFORM public._deduct_aura(v_submitter, 50, 'admin_penalty');
  END IF;

  RETURN p_action;
END;
$$;

-- Edit a player's XP / Aura / ban flag. Roles are NOT editable here (or
-- anywhere in the app): change a role by running SQL yourself.
CREATE OR REPLACE FUNCTION public.admin_update_player(
  p_admin_id UUID, p_user_id UUID, p_xp INT, p_aura INT, p_is_banned BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_aura INT;
  v_role     TEXT;
BEGIN
  PERFORM public._assert_admin(p_admin_id);
  IF p_xp IS NULL OR p_xp NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'xp out of range'; END IF;
  IF p_aura IS NULL OR p_aura NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'aura out of range'; END IF;
  IF p_is_banned IS NULL THEN RAISE EXCEPTION 'is_banned required'; END IF;

  SELECT aura, role INTO v_old_aura, v_role FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player not found'; END IF;
  IF p_is_banned AND v_role = 'admin' THEN RAISE EXCEPTION 'admins cannot be banned here'; END IF;

  UPDATE public.profiles SET xp = p_xp, aura = p_aura, is_banned = p_is_banned WHERE id = p_user_id;

  -- Leave a trace: every manual Aura change is written to the log.
  IF p_aura <> v_old_aura THEN
    INSERT INTO public.aura_log (user_id, delta, reason)
    VALUES (p_user_id, p_aura - v_old_aura, 'admin_adjustment by ' || p_admin_id::text);
  END IF;
END;
$$;

-- ============================================================
-- PERMISSIONS
-- ============================================================
REVOKE ALL ON FUNCTION
  public.start_quest(UUID), public.abandon_quest(UUID), public.submit_quest_proof(UUID, TEXT),
  public.get_jury_queue(), public.get_proof_path_for_viewer(UUID),
  public._resolve_verdict(UUID), public.cast_jury_vote(UUID, BOOLEAN),
  public._assert_admin(UUID), public.admin_resolve_submission(UUID, UUID, TEXT),
  public.admin_update_player(UUID, UUID, INT, INT, BOOLEAN)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.start_quest(UUID), public.abandon_quest(UUID), public.submit_quest_proof(UUID, TEXT),
  public.get_jury_queue(), public.get_proof_path_for_viewer(UUID), public.cast_jury_vote(UUID, BOOLEAN)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.admin_resolve_submission(UUID, UUID, TEXT),
  public.admin_update_player(UUID, UUID, INT, INT, BOOLEAN)
TO service_role;
