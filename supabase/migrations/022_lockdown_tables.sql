-- ============================================================
-- Migration 022: Lock down tables (deny by default)
--
-- THE IDEA (easy version):
--   1. Browsers may only READ their own data. They get no INSERT,
--      UPDATE or DELETE on game tables at all.
--   2. Every change to game state goes through a function (023, 024)
--      that checks who is calling.
--   3. Two layers protect reads: GRANTs (which tables/columns a role
--      may touch) AND Row Level Security (which rows).
--
-- WHY GRANTs: Supabase automatically grants every new table to the
-- `anon` and `authenticated` roles. RLS then does all the work, so one
-- sloppy policy = a hole. We remove those grants and add back only
-- what the app needs.
-- ============================================================

-- ── A. Remove every old policy (also ones added by hand in the
--      dashboard) so we start from a known state ─────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── B. Deny by default ──────────────────────────────────────
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- ...and make sure tables/functions created LATER are not open either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Every table keeps RLS on (a table with RLS on and no policy = nobody sees rows).
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jury_votes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_quests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_luck_rolls  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_purchases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_quests      ENABLE ROW LEVEL SECURITY;

-- ── C. profiles ─────────────────────────────────────────────
-- Read: only your own row (the public leaderboard is a view below).
-- Write: ONLY username and theme. aura, xp, level, luck, streak, role,
-- is_banned can never be changed by a client, whatever the policy says,
-- because the column grant does not allow it.
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username, theme) ON public.profiles TO authenticated;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── D. Public leaderboard: a VIEW with only safe columns ─────
-- A view runs with its owner's rights, so it can read all profiles
-- even though clients cannot. It exposes nothing sensitive
-- (no role, is_banned, luck, last_active...). Only logged-in users.
CREATE OR REPLACE VIEW public.leaderboard
  WITH (security_invoker = false) AS
SELECT id, username, aura, xp, level, streak_days, created_at
FROM public.profiles
ORDER BY xp DESC;
GRANT SELECT ON public.leaderboard TO authenticated;

-- Party list with member count and leader name (clients cannot read
-- other users' profiles directly, so the view does the join safely).
CREATE OR REPLACE VIEW public.party_directory
  WITH (security_invoker = false) AS
SELECT p.id, p.name, p.description, p.emblem, p.leader_id,
       l.username AS leader_username,
       p.max_members, p.aura_pool, p.xp_pool, p.is_recruiting, p.created_at,
       (SELECT COUNT(*) FROM public.party_members m WHERE m.party_id = p.id)::int AS member_count
FROM public.parties p
JOIN public.profiles l ON l.id = p.leader_id;
GRANT SELECT ON public.party_directory TO authenticated;

-- ── E. Read-only tables ─────────────────────────────────────
-- Shared reference data: any logged-in user may read.
GRANT SELECT ON public.quests, public.store_items, public.parties TO authenticated;
CREATE POLICY quests_select       ON public.quests       FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY store_items_select  ON public.store_items  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY parties_select      ON public.parties      FOR SELECT TO authenticated USING (TRUE);

-- Personal data: you may read only your own rows. No client writes.
GRANT SELECT ON public.user_quests, public.jury_votes, public.aura_log,
                public.private_quests, public.daily_logs, public.daily_discoveries,
                public.daily_luck_rolls, public.user_purchases, public.party_members
  TO authenticated;

CREATE POLICY user_quests_select_own       ON public.user_quests       FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY jury_votes_select_own        ON public.jury_votes        FOR SELECT TO authenticated USING (juror_id = auth.uid());
CREATE POLICY aura_log_select_own          ON public.aura_log          FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY private_quests_select_own    ON public.private_quests    FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY daily_logs_select_own        ON public.daily_logs        FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY daily_discoveries_select_own ON public.daily_discoveries FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY daily_luck_rolls_select_own  ON public.daily_luck_rolls  FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY user_purchases_select_own    ON public.user_purchases    FOR SELECT TO authenticated USING (user_id  = auth.uid());
CREATE POLICY party_members_select_own     ON public.party_members     FOR SELECT TO authenticated USING (user_id  = auth.uid());

-- Party quests: visible to members of that party.
GRANT SELECT ON public.party_quests TO authenticated;
CREATE POLICY party_quests_select_members ON public.party_quests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.party_members m
                 WHERE m.party_id = party_quests.party_id AND m.user_id = auth.uid()));

-- NOTE: the browser never reads other people's proofs or pending
-- submissions directly any more. Jurors use get_jury_queue() (024).

-- ── F. aura_log is append-only ──────────────────────────────
-- Clients already cannot write it (no grants). This trigger also stops
-- UPDATE / DELETE / TRUNCATE by anyone else, including our own functions
-- by mistake. Honest limit: a database OWNER can still drop the trigger,
-- so this is tamper-resistant, not tamper-proof.
CREATE OR REPLACE FUNCTION public.block_aura_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'aura_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS aura_log_no_update_delete ON public.aura_log;
CREATE TRIGGER aura_log_no_update_delete
  BEFORE UPDATE OR DELETE ON public.aura_log
  FOR EACH ROW EXECUTE FUNCTION public.block_aura_log_changes();

DROP TRIGGER IF EXISTS aura_log_no_truncate ON public.aura_log;
CREATE TRIGGER aura_log_no_truncate
  BEFORE TRUNCATE ON public.aura_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.block_aura_log_changes();

-- ── G. Realtime: only our own profile row is streamed ───────
-- useProfile() listens for profile updates. With RLS above, each user
-- receives only their own row. (Idempotent: skip if already added.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles')
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
