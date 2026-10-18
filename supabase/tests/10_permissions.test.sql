-- ============================================================
-- TEST 10: who may touch what (grants, RLS, function permissions)
-- Covers audit items: S1, S2, S4, S6, E1, E4, E6, E16
-- ============================================================
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

BEGIN;
SELECT tests.admin();
SELECT tests.make_player(:'alice', 'alice', 500);
SELECT tests.make_player(:'bob',   'bob',   500);

\echo '== profiles: players can change only username + theme'
SELECT tests.login(:'alice');
SELECT tests.denied('cannot raise own aura (S1)',        format('UPDATE public.profiles SET aura = 99999 WHERE id = %L', :'alice'));
SELECT tests.denied('cannot set own xp',                 format('UPDATE public.profiles SET xp = 5000000 WHERE id = %L', :'alice'));
SELECT tests.denied('cannot set own level',              format('UPDATE public.profiles SET level = 99 WHERE id = %L', :'alice'));
SELECT tests.denied('cannot set own luck',               format('UPDATE public.profiles SET luck = 100 WHERE id = %L', :'alice'));
SELECT tests.denied('cannot set luck boost',             format('UPDATE public.profiles SET active_luck_boost = 50 WHERE id = %L', :'alice'));
SELECT tests.denied('cannot become admin (S1)',          format($$UPDATE public.profiles SET role = 'admin' WHERE id = %L$$, :'alice'));
SELECT tests.denied('cannot unban self',                 format('UPDATE public.profiles SET is_banned = FALSE WHERE id = %L', :'alice'));
SELECT tests.denied('cannot reset streak/last_active',   format('UPDATE public.profiles SET last_active = NULL WHERE id = %L', :'alice'));
SELECT tests.allowed('can change own theme',             format($$UPDATE public.profiles SET theme = 'modern' WHERE id = %L$$, :'alice'));
SELECT tests.allowed('can change own username',          format($$UPDATE public.profiles SET username = 'alice_2' WHERE id = %L$$, :'alice'));
SELECT tests.denied('cannot insert profiles',            format($$INSERT INTO public.profiles (id, username) VALUES (gen_random_uuid(), 'x_fake')$$));
SELECT tests.denied('cannot delete profiles',            format('DELETE FROM public.profiles WHERE id = %L', :'alice'));

-- Updating someone else's row is silently filtered by RLS (0 rows). Check it did nothing:
UPDATE public.profiles SET username = 'hacked_bob' WHERE id = :'bob';
SELECT tests.admin();
SELECT tests.ok('alice could not rename bob', (SELECT username FROM public.profiles WHERE id = :'bob') = 'bob');

\echo '== profiles: reads'
SELECT tests.login(:'alice');
SELECT tests.ok('alice sees only her own profile row (S6)', (SELECT COUNT(*) FROM public.profiles) = 1);
SELECT tests.ok('leaderboard shows both players',           (SELECT COUNT(*) FROM public.leaderboard) = 2);
SELECT tests.denied('leaderboard has no role column',       'SELECT role FROM public.leaderboard');
SELECT tests.denied('leaderboard has no is_banned column',  'SELECT is_banned FROM public.leaderboard');
SELECT tests.anon();
SELECT tests.denied('anon cannot read profiles (S6)',       'SELECT * FROM public.profiles');
SELECT tests.denied('anon cannot read leaderboard',         'SELECT * FROM public.leaderboard');
SELECT tests.denied('anon cannot read quests',              'SELECT * FROM public.quests');

\echo '== no client writes on any game table; anon has no access at all'
SELECT tests.admin();
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['quests','user_quests','jury_votes','aura_log','private_quests','daily_logs',
                               'daily_discoveries','daily_luck_rolls','store_items','user_purchases',
                               'parties','party_members','party_quests'])
  LOOP
    PERFORM tests.ok(t || ': authenticated cannot INSERT/UPDATE/DELETE',
      NOT has_table_privilege('authenticated', 'public.' || t, 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
      AND NOT has_table_privilege('authenticated', 'public.' || t, 'DELETE'));
  END LOOP;

  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    PERFORM tests.ok(t || ': anon has no privileges',
      NOT has_table_privilege('anon', 'public.' || t, 'SELECT')
      AND NOT has_table_privilege('anon', 'public.' || t, 'INSERT')
      AND NOT has_table_privilege('anon', 'public.' || t, 'UPDATE')
      AND NOT has_table_privilege('anon', 'public.' || t, 'DELETE'));
  END LOOP;
END $$;

\echo '== function inventory: every function in public is locked down (S2)'
DO $$
DECLARE
  r            RECORD;
  v_anon       TEXT;
  v_auth       TEXT;
  v_no_path    TEXT;
  v_expected   TEXT[] := ARRAY[
    'abandon_quest','cast_jury_vote','claim_daily_discovery','complete_private_quest','create_party',
    'create_private_quest','get_jury_queue','get_proof_path_for_viewer','join_party','leave_party',
    'purchase_store_item','report_focus_violation','roll_daily_luck','save_daily_entry','start_quest',
    'submit_daily_log','submit_quest_proof','update_streak'];
  v_actual     TEXT[];
BEGIN
  -- our own functions only (skip anything installed by an extension)
  CREATE TEMP TABLE fn AS
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');

  SELECT string_agg(proname, ', ') INTO v_anon FROM fn WHERE has_function_privilege('anon', oid, 'EXECUTE');
  PERFORM tests.ok('anon can execute NO function (found: ' || COALESCE(v_anon, 'none') || ')', v_anon IS NULL);

  SELECT array_agg(proname ORDER BY proname) INTO v_actual FROM fn WHERE has_function_privilege('authenticated', oid, 'EXECUTE');
  PERFORM tests.ok('authenticated can execute exactly the public API (got: ' || array_to_string(v_actual, ',') || ')',
                   v_actual = (SELECT array_agg(x ORDER BY x) FROM unnest(v_expected) x));

  SELECT string_agg(proname, ', ') INTO v_no_path FROM fn
  WHERE prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%');
  PERFORM tests.ok('every SECURITY DEFINER function pins search_path (offenders: ' || COALESCE(v_no_path, 'none') || ')', v_no_path IS NULL);

  SELECT string_agg(proname, ', ') INTO v_auth FROM fn
  WHERE proname LIKE 'admin\_%' AND has_function_privilege('authenticated', oid, 'EXECUTE');
  PERFORM tests.ok('admin_* functions are not callable by logged-in users', v_auth IS NULL);
  PERFORM tests.ok('admin_* functions ARE callable by service_role',
    (SELECT COUNT(*) FROM fn WHERE proname LIKE 'admin\_%' AND has_function_privilege('service_role', oid, 'EXECUTE')) = 2);
END $$;

\echo '== the old open functions are gone (E1, E2, E4)'
SELECT tests.ok('deduct_aura removed',        to_regprocedure('public.deduct_aura(uuid,integer,text)') IS NULL);
SELECT tests.ok('grant_quest_rewards removed',to_regprocedure('public.grant_quest_rewards(uuid,integer,integer)') IS NULL);
SELECT tests.ok('public resolve_verdict removed', to_regprocedure('public.resolve_verdict(uuid)') IS NULL);
SELECT tests.ok('get_jury_pool removed',      to_regprocedure('public.get_jury_pool(uuid,uuid,integer)') IS NULL);

SELECT tests.login(:'alice');
SELECT tests.denied('user cannot call _grant_rewards',  format('SELECT public._grant_rewards(%L, 100, 100)', :'alice'));
SELECT tests.denied('user cannot call _deduct_aura',    format($$SELECT public._deduct_aura(%L, 5, 'x')$$, :'alice'));
SELECT tests.denied('user cannot call _resolve_verdict',format('SELECT public._resolve_verdict(gen_random_uuid())'));
SELECT tests.denied('user cannot call admin_update_player', format('SELECT public.admin_update_player(%L, %L, 1, 1, false)', :'alice', :'alice'));
SELECT tests.anon();
SELECT tests.denied('anon cannot call update_streak',   'SELECT public.update_streak()');
SELECT tests.denied('anon cannot call purchase_store_item', 'SELECT public.purchase_store_item(gen_random_uuid())');

\echo '== aura_log is append-only (E16)'
SELECT tests.login(:'alice');
SELECT tests.denied('user cannot insert into aura_log', format($$INSERT INTO public.aura_log (user_id, delta, reason) VALUES (%L, 999, 'x')$$, :'alice'));
SELECT tests.admin();
INSERT INTO public.aura_log (user_id, delta, reason) VALUES (:'alice', 1, 'test');
SELECT tests.denied('even the owner cannot UPDATE aura_log',   'UPDATE public.aura_log SET delta = 0');
SELECT tests.denied('even the owner cannot DELETE aura_log',   'DELETE FROM public.aura_log');
SELECT tests.denied('even the owner cannot TRUNCATE aura_log', 'TRUNCATE public.aura_log');

ROLLBACK;
