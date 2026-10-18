-- ============================================================
-- Tiny test toolkit (plain SQL, no extensions needed).
--
-- Session style (used by 10_permissions ... 40_storage):
--   SELECT tests.login('<uuid>');     -- act as that logged-in user
--   SELECT tests.anon();              -- act as a logged-out visitor
--   SELECT tests.admin();             -- back to superuser (set-up / checking)
--   SELECT tests.ok('label', <bool>);            -- assert true (stops at first failure)
--   SELECT tests.denied('label', 'sql text');    -- assert the statement FAILS
--   SELECT tests.allowed('label', 'sql text');   -- assert the statement WORKS
--
-- State style (used by 05_attacks): run an attack, then check what is
-- actually in the database. Failures are collected, not fatal, so one
-- run lists every hole.
--   tests.exec_as(role, user_id, sql)   -> {"rows": n} or {"error": "..."}
--   tests.scalar_as(role, user_id, sql) -> first column as text, or 'ERROR: ...'
--   tests.check('label', <bool>)        -- records ok / FAIL
--   tests.report()                      -- prints totals, raises if any FAIL
-- ============================================================
CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO PUBLIC;

CREATE OR REPLACE FUNCTION tests.admin() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
END $$;

CREATE OR REPLACE FUNCTION tests.login(p_user UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  SET ROLE authenticated;
END $$;

CREATE OR REPLACE FUNCTION tests.anon() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
  SET ROLE anon;
END $$;

CREATE OR REPLACE FUNCTION tests.service() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
  SET ROLE service_role;
END $$;

CREATE OR REPLACE FUNCTION tests.ok(p_label TEXT, p_condition BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS TRUE THEN
    RAISE NOTICE '  ok    %', p_label;
  ELSE
    RAISE EXCEPTION '  FAIL  %', p_label;
  END IF;
END $$;

-- Runs a statement as the CURRENT role; passes only if it raises an error.
CREATE OR REPLACE FUNCTION tests.denied(p_label TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_role TEXT := current_user;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  ok    % (blocked: %)', p_label, left(SQLERRM, 60);
    RETURN;
  END;
  RAISE EXCEPTION '  FAIL  % (statement was allowed!)', p_label;
END $$;

CREATE OR REPLACE FUNCTION tests.allowed(p_label TEXT, p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE NOTICE '  ok    %', p_label;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION '  FAIL  % (error: %)', p_label, SQLERRM;
END $$;

-- Fixture helper: create a player with a given Aura (superuser only).
CREATE OR REPLACE FUNCTION tests.make_player(p_id UUID, p_name TEXT, p_aura INT DEFAULT 0) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES (p_id, p_name || '@test.io');
  UPDATE public.profiles SET aura = p_aura WHERE id = p_id;
END $$;

-- ── State-style helpers ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tests.results (n SERIAL, name TEXT, ok BOOLEAN);

-- Run SQL as `p_role` acting as user `p_uid`, WITHOUT stopping on error.
CREATE OR REPLACE FUNCTION tests.exec_as(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rows BIGINT;
  v_out  JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_out := jsonb_build_object('rows', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_out := jsonb_build_object('error', SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION tests.scalar_as(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_val TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql INTO v_val;
  EXCEPTION WHEN OTHERS THEN
    v_val := 'ERROR: ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_val;
END $$;

CREATE OR REPLACE FUNCTION tests.fails(p_role TEXT, p_uid UUID, p_sql TEXT) RETURNS BOOLEAN
LANGUAGE sql AS $$ SELECT (tests.exec_as(p_role, p_uid, p_sql)) ? 'error' $$;

CREATE OR REPLACE FUNCTION tests.check(p_name TEXT, p_ok BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tests.results (name, ok) VALUES (p_name, coalesce(p_ok, false));
  RAISE NOTICE '  %  %', CASE WHEN coalesce(p_ok, false) THEN 'ok  ' ELSE 'FAIL' END, p_name;
END $$;

CREATE OR REPLACE FUNCTION tests.report() RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_pass INT; v_fail INT;
BEGIN
  SELECT count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok) INTO v_pass, v_fail FROM tests.results;
  RAISE NOTICE '  -> % passed, % failed', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% attack test(s) failed', v_fail;
  END IF;
END $$;

-- Readable fixed user ids: tests.uid(1) = 00000000-0000-0000-0000-000000000001
CREATE OR REPLACE FUNCTION tests.uid(p_n INT) RETURNS UUID LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- 1 alice attacker (aura 150) | 2 bob victim (300) | 3 carol (200) | 4 dave (100) | 9 admin
-- luck is 0 everywhere so critical hits never make results random.
CREATE OR REPLACE FUNCTION tests.seed_users() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (tests.uid(1), 'alice@attack.test', '{"username":"alice"}'),
    (tests.uid(2), 'bob@attack.test',   '{"username":"bob"}'),
    (tests.uid(3), 'carol@attack.test', '{"username":"carol"}'),
    (tests.uid(4), 'dave@attack.test',  '{"username":"dave"}'),
    (tests.uid(9), 'admin@attack.test', '{"username":"admin"}');
  UPDATE public.profiles SET aura = 150, luck = 0 WHERE id = tests.uid(1);
  UPDATE public.profiles SET aura = 300, luck = 0 WHERE id = tests.uid(2);
  UPDATE public.profiles SET aura = 200, luck = 0 WHERE id = tests.uid(3);
  UPDATE public.profiles SET aura = 100, luck = 0 WHERE id = tests.uid(4);
  UPDATE public.profiles SET role = 'admin'       WHERE id = tests.uid(9);
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO PUBLIC;
