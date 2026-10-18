-- ============================================================
-- ATTACK TESTS
--
-- Each block below is one attack from docs/SECURITY.md. It tries the
-- attack as a malicious user and then checks the database STATE: if
-- nothing changed, the attack is blocked.
--
-- These tests do not use the new API, so they can also be run against
-- the ORIGINAL migrations (001-020) to prove the holes were real:
--     MIGRATIONS_UPTO=020 scripts/test-db.sh
-- ============================================================

BEGIN;

DO $test$
DECLARE
  alice UUID := tests.uid(1);
  bob   UUID := tests.uid(2);
  carol UUID := tests.uid(3);
  dave  UUID := tests.uid(4);
  adm   UUID := tests.uid(9);

  q_a      UUID;   -- three seeded global quests
  q_b      UUID;
  q_c      UUID;
  uq_active  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';  -- alice, active
  uq_pending UUID := 'aaaaaaaa-0000-0000-0000-000000000002';  -- alice, pending + 2 votes
  uq_bob     UUID := 'aaaaaaaa-0000-0000-0000-000000000003';  -- bob, active
  uq_done    UUID := 'aaaaaaaa-0000-0000-0000-000000000004';  -- alice, already completed
  pq_bob     UUID := 'bbbbbbbb-0000-0000-0000-000000000001';  -- bob's private quest
  pq_alice   UUID := 'bbbbbbbb-0000-0000-0000-000000000002';  -- alice's private quest
  item_id    UUID;
  party_id   UUID := 'cccccccc-0000-0000-0000-000000000001';  -- bob leads it

  snap  JSONB;
  col   TEXT;
  n     BIGINT;
  txt   TEXT;
  bad   INT;
BEGIN
  PERFORM tests.seed_users();

  SELECT id INTO q_a FROM public.quests WHERE title = 'Deep Work Sprint';
  SELECT id INTO q_b FROM public.quests WHERE title = 'Bug Squasher';
  SELECT id INTO q_c FROM public.quests WHERE title = 'Morning Stretch';
  SELECT id INTO item_id FROM public.store_items WHERE name = 'Title: The Focused';

  -- ── Fixture rows, written as superuser (bypasses every rule) ──
  INSERT INTO public.user_quests (id, user_id, quest_id, status, started_at) VALUES
    (uq_active, alice, q_a, 'active', now() - interval '1 hour');
  INSERT INTO public.user_quests (id, user_id, quest_id, status, proof_url, started_at) VALUES
    (uq_pending, alice, q_b, 'pending_verification', 'alice/proof.png', now() - interval '1 hour');
  INSERT INTO public.user_quests (id, user_id, quest_id, status, started_at) VALUES
    (uq_bob, bob, q_a, 'active', now() - interval '1 hour');
  INSERT INTO public.user_quests (id, user_id, quest_id, status, jury_verdict, completed_at) VALUES
    (uq_done, alice, q_c, 'completed', 1, now());
  INSERT INTO public.jury_votes (user_quest_id, juror_id, vote, juror_aura_snapshot) VALUES
    (uq_pending, bob, true, 300), (uq_pending, carol, true, 200),
    (uq_done, bob, true, 300), (uq_done, carol, true, 200), (uq_done, dave, true, 100);
  INSERT INTO public.private_quests (id, user_id, title, skill_type) VALUES
    (pq_bob, bob, 'bob private', 'focus'), (pq_alice, alice, 'alice private', 'focus');
  INSERT INTO public.parties (id, name, leader_id) VALUES (party_id, 'Bobs Party', bob);
  INSERT INTO public.party_members (party_id, user_id, role) VALUES (party_id, bob, 'leader');
  INSERT INTO public.aura_log (user_id, delta, reason) VALUES (alice, -5, 'seed');
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('submissions', 'alice/proof.png', alice);

  -- ═══ S1  A user edits their own privileged profile columns ═══
  SELECT to_jsonb(p) INTO snap FROM public.profiles p WHERE id = alice;
  FOREACH col IN ARRAY ARRAY[
    'aura = 999999', 'xp = 999999', 'level = 99', 'luck = 100', 'streak_days = 999',
    'role = ''admin''', 'is_banned = false', 'active_luck_boost = 100', 'last_active = NULL'
  ] LOOP
    PERFORM tests.exec_as('authenticated', alice,
      format('UPDATE public.profiles SET %s WHERE id = %L', col, alice));
    PERFORM tests.check('S1  user cannot change own profile column: ' || col,
      (SELECT to_jsonb(p) = snap FROM public.profiles p WHERE id = alice));
    UPDATE public.profiles SET aura = 150, xp = 0, level = 1, luck = 0, streak_days = 0, role = 'user',
           is_banned = false, active_luck_boost = 0, last_active = NULL WHERE id = alice;
    SELECT to_jsonb(p) INTO snap FROM public.profiles p WHERE id = alice;
  END LOOP;

  PERFORM tests.exec_as('authenticated', alice,
    format('UPDATE public.profiles SET aura = 0 WHERE id = %L', bob));
  PERFORM tests.check('S1  user cannot edit ANOTHER user''s profile',
    (SELECT aura = 300 FROM public.profiles WHERE id = bob));

  -- ═══ S6  Profile reads ═══
  txt := tests.scalar_as('anon', NULL, 'SELECT count(*) FROM public.profiles');
  PERFORM tests.check('S6  anonymous visitors cannot read profiles', txt = '0' OR txt LIKE 'ERROR%');
  txt := tests.scalar_as('authenticated', alice, format('SELECT count(*) FROM public.profiles WHERE id = %L', bob));
  PERFORM tests.check('S6  a user cannot read another user''s raw profile row (role, is_banned...)', txt = '0' OR txt LIKE 'ERROR%');
  SELECT count(*) INTO bad FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'leaderboard'
     AND column_name IN ('role', 'is_banned', 'luck', 'active_luck_boost', 'last_active');
  PERFORM tests.check('S6  leaderboard view exposes no privileged columns', bad = 0);
  txt := tests.scalar_as('anon', NULL, format('SELECT count(*) FROM public.get_jury_pool(%L, %L, 5)', alice, q_a));
  PERFORM tests.check('S6  get_jury_pool does not leak profile rows', txt IS NULL OR txt = '0' OR txt LIKE 'ERROR%');

  -- ═══ S2  Definer RPCs callable with someone else's id ═══
  SELECT to_jsonb(p) INTO snap FROM public.profiles p WHERE id = bob;
  PERFORM tests.exec_as('anon', NULL,
    format('SELECT public.grant_quest_rewards(%L, 5000, 500)', bob));
  PERFORM tests.check('S2  anonymous cannot grant rewards to a victim',
    (SELECT to_jsonb(p) = snap FROM public.profiles p WHERE id = bob));
  PERFORM tests.exec_as('authenticated', alice,
    format('SELECT public.grant_quest_rewards(%L, 5000, 500)', alice));
  PERFORM tests.check('S2  user cannot grant rewards to themselves',
    (SELECT xp = 0 AND aura = 150 FROM public.profiles WHERE id = alice));
  PERFORM tests.exec_as('authenticated', alice,
    format('SELECT public.deduct_aura(%L, -1000, ''x'')', alice));
  PERFORM tests.check('E1  deduct_aura with a NEGATIVE amount cannot mint Aura',
    (SELECT aura = 150 FROM public.profiles WHERE id = alice));
  PERFORM tests.exec_as('authenticated', alice,
    format('SELECT public.deduct_aura(%L, 100, ''x'')', bob));
  PERFORM tests.check('S2  user cannot deduct a victim''s Aura',
    (SELECT aura = 300 FROM public.profiles WHERE id = bob));
  PERFORM tests.exec_as('authenticated', alice,
    format('SELECT public.purchase_store_item(%L, %L)', bob, item_id));
  PERFORM tests.check('E4  user cannot spend a victim''s Aura in the store',
    (SELECT aura = 300 FROM public.profiles WHERE id = bob));
  PERFORM tests.exec_as('authenticated', alice, format('SELECT public.update_streak(%L)', bob));
  PERFORM tests.check('S2  user cannot trigger a victim''s daily reward',
    (SELECT last_active IS NULL AND xp = 0 FROM public.profiles WHERE id = bob));
  PERFORM tests.exec_as('authenticated', alice, format('SELECT public.roll_daily_luck(%L)', bob));
  PERFORM tests.check('S2  user cannot roll luck for a victim',
    NOT EXISTS (SELECT 1 FROM public.daily_luck_rolls WHERE user_id = bob));
  PERFORM tests.exec_as('authenticated', alice, format('SELECT public.grant_temporary_luck(%L, 100)', alice));
  PERFORM tests.check('E14 user cannot give themselves a luck boost',
    (SELECT active_luck_boost = 0 FROM public.profiles WHERE id = alice));
  PERFORM tests.exec_as('authenticated', alice, format('SELECT public.complete_private_quest(%L, %L)', pq_bob, bob));
  PERFORM tests.check('E5  user cannot complete a victim''s private quest',
    (SELECT status = 'active' FROM public.private_quests WHERE id = pq_bob));
  PERFORM tests.exec_as('authenticated', alice, format('SELECT public.start_quest(%L, %L)', bob, q_c));
  PERFORM tests.check('S2  user cannot start a quest on behalf of a victim',
    NOT EXISTS (SELECT 1 FROM public.user_quests WHERE user_id = bob AND quest_id = q_c));

  -- ═══ S3  submit_quest_proof on someone else's quest ═══
  PERFORM tests.exec_as('authenticated', alice,
    format('SELECT public.submit_quest_proof(%L, ''evil/path.png'', NULL)', uq_bob));
  PERFORM tests.check('S3  user cannot attach a proof to someone else''s quest',
    (SELECT status = 'active' AND proof_url IS NULL FROM public.user_quests WHERE id = uq_bob));

  -- ═══ S4  Direct writes to user_quests ═══
  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.user_quests (user_id, quest_id, status, jury_verdict) VALUES (%L, %L, ''completed'', 1)',
           alice, (SELECT id FROM public.quests WHERE title = 'Cardio Burst')));
  PERFORM tests.check('S4  user cannot insert a pre-completed quest',
    NOT EXISTS (SELECT 1 FROM public.user_quests WHERE user_id = alice AND status = 'completed' AND quest_id <> q_c));
  PERFORM tests.exec_as('authenticated', alice,
    format('UPDATE public.user_quests SET status = ''completed'' WHERE id = %L', uq_active));
  PERFORM tests.check('S4  user cannot mark their own quest completed',
    (SELECT status = 'active' FROM public.user_quests WHERE id = uq_active));
  PERFORM tests.exec_as('authenticated', alice,
    format('DELETE FROM public.user_quests WHERE id = %L', uq_pending));
  PERFORM tests.check('S4  user cannot delete a pending quest to wipe its votes',
    EXISTS (SELECT 1 FROM public.user_quests WHERE id = uq_pending)
    AND (SELECT count(*) FROM public.jury_votes WHERE user_quest_id = uq_pending) = 2);

  -- ═══ S5  Jury integrity ═══
  PERFORM tests.exec_as('authenticated', dave,
    format('INSERT INTO public.jury_votes (user_quest_id, juror_id, vote, juror_aura_snapshot) VALUES (%L, %L, false, 1000000000)',
           uq_pending, dave));
  PERFORM tests.check('S5  juror cannot insert a vote with a forged Aura weight',
    NOT EXISTS (SELECT 1 FROM public.jury_votes WHERE juror_id = dave AND user_quest_id = uq_pending));
  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.jury_votes (user_quest_id, juror_id, vote, juror_aura_snapshot) VALUES (%L, %L, true, 150)',
           uq_pending, alice));
  PERFORM tests.check('S5  user cannot vote on their own submission',
    NOT EXISTS (SELECT 1 FROM public.jury_votes WHERE juror_id = alice AND user_quest_id = uq_pending));
  -- Replay: alice's quest uq_done is already completed. Re-resolving must not pay again.
  FOR n IN 1..3 LOOP
    PERFORM tests.exec_as('authenticated', alice, format('SELECT public.resolve_verdict(%L)', uq_done));
  END LOOP;
  PERFORM tests.check('E2  resolve_verdict cannot be replayed to farm rewards',
    (SELECT xp = 0 AND aura = 150 FROM public.profiles WHERE id = alice)
    AND (SELECT xp = 0 AND aura = 300 FROM public.profiles WHERE id = bob));

  -- ═══ Pending proofs are not world-readable ═══
  txt := tests.scalar_as('anon', NULL, 'SELECT count(*) FROM public.user_quests');
  PERFORM tests.check('S6  anonymous visitors cannot read quests / proofs', txt = '0' OR txt LIKE 'ERROR%');
  txt := tests.scalar_as('authenticated', dave, format('SELECT count(*) FROM public.user_quests WHERE id = %L', uq_pending));
  PERFORM tests.check('S6  a random user cannot read someone else''s user_quests row', txt = '0' OR txt LIKE 'ERROR%');

  -- ═══ aura_log is append-only ═══
  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.aura_log (user_id, delta, reason) VALUES (%L, 9999, ''forged'')', alice));
  PERFORM tests.check('E16 user cannot forge aura_log rows',
    NOT EXISTS (SELECT 1 FROM public.aura_log WHERE reason = 'forged'));
  PERFORM tests.exec_as('authenticated', alice, format('UPDATE public.aura_log SET delta = 0 WHERE user_id = %L', alice));
  PERFORM tests.exec_as('authenticated', alice, format('DELETE FROM public.aura_log WHERE user_id = %L', alice));
  PERFORM tests.check('E16 user cannot edit or delete aura_log rows',
    EXISTS (SELECT 1 FROM public.aura_log WHERE user_id = alice AND delta = -5));
  PERFORM tests.check('E16 even the table owner cannot UPDATE aura_log (append-only trigger)',
    tests.fails('postgres', NULL, 'UPDATE public.aura_log SET delta = 0'));
  PERFORM tests.check('E16 even the table owner cannot DELETE from aura_log',
    tests.fails('postgres', NULL, 'DELETE FROM public.aura_log'));

  -- ═══ Store / private quests / parties ═══
  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.user_purchases (user_id, item_id, aura_spent) VALUES (%L, %L, 0)', alice, item_id));
  PERFORM tests.check('E4  user cannot insert a free purchase',
    NOT EXISTS (SELECT 1 FROM public.user_purchases WHERE user_id = alice));

  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.private_quests (user_id, title, skill_type, xp_reward, aura_reward, status) VALUES (%L, ''hax'', ''focus'', 200, 20, ''completed'')', alice));
  PERFORM tests.check('E5  user cannot insert a pre-completed private quest with Aura reward',
    NOT EXISTS (SELECT 1 FROM public.private_quests WHERE title = 'hax'));
  PERFORM tests.exec_as('authenticated', alice,
    format('UPDATE public.private_quests SET xp_reward = 200, aura_reward = 20 WHERE id = %L', pq_alice));
  PERFORM tests.check('E5  user cannot edit rewards of an existing private quest',
    (SELECT xp_reward = 50 AND aura_reward = 0 FROM public.private_quests WHERE id = pq_alice));

  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.parties (name, leader_id, aura_pool, xp_pool) VALUES (''hax party'', %L, 9999, 9999)', alice));
  PERFORM tests.check('E6  user cannot create a party with pre-filled pools',
    NOT EXISTS (SELECT 1 FROM public.parties WHERE name = 'hax party'));
  PERFORM tests.exec_as('authenticated', bob,
    format('UPDATE public.parties SET aura_pool = 9999, xp_pool = 9999 WHERE id = %L', party_id));
  PERFORM tests.check('E6  party leader cannot edit the party pools',
    (SELECT aura_pool = 0 AND xp_pool = 0 FROM public.parties WHERE id = party_id));
  PERFORM tests.exec_as('authenticated', alice,
    format('INSERT INTO public.party_members (party_id, user_id, role) VALUES (%L, %L, ''leader'')', party_id, alice));
  PERFORM tests.check('E6  user cannot insert themselves into a party directly',
    NOT EXISTS (SELECT 1 FROM public.party_members WHERE user_id = alice));

  -- ═══ Admin power must not be reachable from the client ═══
  PERFORM tests.exec_as('authenticated', alice, format('UPDATE public.profiles SET role = ''admin'' WHERE id = %L', alice));
  PERFORM tests.exec_as('authenticated', alice, 'INSERT INTO public.quests (title, difficulty, skill_type, xp_reward, duration_minutes) VALUES (''hax quest'', ''easy'', ''focus'', 1, 1)');
  PERFORM tests.check('S1  self-promoting to admin does not unlock quest writes',
    NOT EXISTS (SELECT 1 FROM public.quests WHERE title = 'hax quest'));
  PERFORM tests.exec_as('authenticated', adm, 'INSERT INTO public.quests (title, difficulty, skill_type, xp_reward, duration_minutes) VALUES (''admin direct'', ''easy'', ''focus'', 1, 1)');
  PERFORM tests.check('S7  even a real admin cannot write quests straight from the browser (server routes only)',
    NOT EXISTS (SELECT 1 FROM public.quests WHERE title = 'admin direct'));

  -- ═══ S8  Storage ═══
  PERFORM tests.check('S8  proof bucket is private',
    (SELECT public = false FROM storage.buckets WHERE id = 'submissions'));
  PERFORM tests.exec_as('authenticated', bob,
    'INSERT INTO storage.objects (bucket_id, name, owner) VALUES (''submissions'', ''' || alice || '/planted.png'', ''' || bob || ''')');
  PERFORM tests.check('S8  user cannot upload into another user''s folder',
    NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/planted.png'));
  PERFORM tests.exec_as('authenticated', bob,
    'INSERT INTO storage.objects (bucket_id, name, owner) VALUES (''submissions'', ''' || bob || '/page.html'', ''' || bob || ''')');
  PERFORM tests.check('S8  policy rejects non-image file extensions',
    NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/page.html'));
  txt := tests.scalar_as('authenticated', carol, 'SELECT count(*) FROM storage.objects WHERE bucket_id = ''submissions''');
  PERFORM tests.check('S8  other users cannot list proof files directly', txt = '0' OR txt LIKE 'ERROR%');
  txt := tests.scalar_as('anon', NULL, 'SELECT count(*) FROM storage.objects');
  PERFORM tests.check('S8  anonymous visitors cannot list storage objects', txt = '0' OR txt LIKE 'ERROR%');
  PERFORM tests.check('S8  bucket restricts size and MIME types at the platform level',
    (SELECT file_size_limit IS NOT NULL AND allowed_mime_types IS NOT NULL FROM storage.buckets WHERE id = 'submissions'));

  -- ═══ Structural guards: these catch NEW mistakes in future migrations ═══
  SELECT count(*) INTO bad FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
  PERFORM tests.check('STRUCT  anon has NO privileges on any public table or view', bad = 0);

  SELECT count(*) INTO bad FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND (has_table_privilege('authenticated', c.oid, 'INSERT')
       OR has_table_privilege('authenticated', c.oid, 'UPDATE')
       OR has_table_privilege('authenticated', c.oid, 'DELETE')
       OR has_table_privilege('authenticated', c.oid, 'TRUNCATE'));
  PERFORM tests.check('STRUCT  authenticated has NO table-level write privilege anywhere', bad = 0);

  SELECT count(*) INTO bad FROM pg_attribute a
   WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND has_column_privilege('authenticated', 'public.profiles', a.attname, 'UPDATE')
     AND a.attname NOT IN ('username', 'theme');
  PERFORM tests.check('STRUCT  users can update only profiles.username and profiles.theme', bad = 0);

  SELECT count(*) INTO bad FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE');
  PERFORM tests.check('STRUCT  anon can execute NO function in public', bad = 0);

  SELECT count(*) INTO bad FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%');
  PERFORM tests.check('STRUCT  every SECURITY DEFINER function pins its search_path', bad = 0);

  SELECT count(*) INTO bad FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND EXISTS (SELECT 1 FROM unnest(p.proargnames) a WHERE a ~ '^p_(user|juror|submitter|owner)(_id)?$');
  PERFORM tests.check('STRUCT  no user-callable function takes a user id parameter', bad = 0);

END
$test$;

SELECT tests.report();
ROLLBACK;
