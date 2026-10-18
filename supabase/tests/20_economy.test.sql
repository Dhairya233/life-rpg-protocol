-- ============================================================
-- TEST 20: Aura/XP economy, daily systems, store, private quests,
--          parties, sign-up. Covers audit items E1, E4, E5, E6, E11, E14, E17.
-- ============================================================
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set carol '33333333-3333-3333-3333-333333333333'

BEGIN;
SELECT tests.admin();
SELECT tests.make_player(:'alice', 'alice', 0);
SELECT tests.make_player(:'bob',   'bob',   0);
SELECT tests.make_player(:'carol', 'carol', 0);

\echo '== bounded rewards and deductions (E1)'
SELECT tests.denied('negative XP grant rejected',   format('SELECT public._grant_rewards(%L, -5, 0)', :'alice'));
SELECT tests.denied('absurd XP grant rejected',     format('SELECT public._grant_rewards(%L, 5001, 0)', :'alice'));
SELECT tests.denied('absurd Aura grant rejected',   format('SELECT public._grant_rewards(%L, 0, 501)', :'alice'));
SELECT tests.denied('negative deduction rejected (it used to MINT aura)', format($$SELECT public._deduct_aura(%L, -1000, 'x')$$, :'alice'));
SELECT public._grant_rewards(:'alice', 0, 3, 'test');
SELECT public._deduct_aura(:'alice', 50, 'test');
SELECT tests.ok('aura never below zero',            (SELECT aura FROM public.profiles WHERE id = :'alice') = 0);
SELECT tests.ok('log records what was REALLY taken (-3, not -50)',
                (SELECT delta FROM public.aura_log WHERE user_id = :'alice' AND reason = 'test' AND delta < 0) = -3);

\echo '== luck boost is capped'
SELECT public._add_luck_boost(:'alice', 20); SELECT public._add_luck_boost(:'alice', 20); SELECT public._add_luck_boost(:'alice', 20);
SELECT tests.ok('boost capped at 50', (SELECT active_luck_boost FROM public.profiles WHERE id = :'alice') = 50);
UPDATE public.profiles SET active_luck_boost = 0;

\echo '== daily login / streak (E1, S1)'
SELECT tests.login(:'alice');
SELECT public.update_streak();
SELECT public.update_streak();
SELECT tests.admin();
SELECT tests.ok('daily reward paid once: +50 XP', (SELECT xp FROM public.profiles WHERE id = :'alice') = 50);
SELECT tests.ok('daily reward paid once: +10 Aura', (SELECT aura FROM public.profiles WHERE id = :'alice') = 10);
SELECT tests.ok('streak is 1', (SELECT streak_days FROM public.profiles WHERE id = :'alice') = 1);

\echo '== banned players cannot act (E11)'
UPDATE public.profiles SET is_banned = TRUE WHERE id = :'bob';
SELECT tests.login(:'bob');
SELECT tests.denied('banned player cannot claim daily reward', 'SELECT public.update_streak()');
SELECT tests.denied('banned player cannot roll luck',          'SELECT public.roll_daily_luck()');
SELECT tests.admin();
UPDATE public.profiles SET is_banned = FALSE WHERE id = :'bob';

\echo '== daily luck: one roll per day'
SELECT tests.login(:'alice');
CREATE TEMP TABLE roll1 AS SELECT public.roll_daily_luck() AS r;
CREATE TEMP TABLE roll2 AS SELECT public.roll_daily_luck() AS r;
GRANT SELECT ON roll1, roll2 TO authenticated;
SELECT tests.ok('second roll returns the same value', (SELECT r FROM roll1) = (SELECT r FROM roll2));
SELECT tests.admin();
SELECT tests.ok('only one roll stored', (SELECT COUNT(*) FROM public.daily_luck_rolls WHERE user_id = :'alice') = 1);

\echo '== daily discovery: once per day, fixed luck (E14)'
SELECT tests.login(:'alice');
CREATE TEMP TABLE d1 AS SELECT public.claim_daily_discovery('img-ref', 'nice') AS r;
CREATE TEMP TABLE d2 AS SELECT public.claim_daily_discovery('img-ref', 'again') AS r;
SELECT tests.admin();
SELECT tests.ok('first discovery succeeds',  (SELECT r->>'success' FROM d1) = 'true');
SELECT tests.ok('second discovery refused',  (SELECT r->>'error' FROM d2) = 'limit_reached');
SELECT tests.ok('luck boost is exactly +10', (SELECT active_luck_boost FROM public.profiles WHERE id = :'alice') = 10);
SELECT tests.login(:'alice');
SELECT tests.denied('overlong summary rejected', $$SELECT public.claim_daily_discovery('x', repeat('a', 501))$$);

\echo '== focus violation: fixed 5 Aura penalty'
SELECT tests.admin();
UPDATE public.profiles SET aura = 100 WHERE id = :'alice';
SELECT tests.login(:'alice');
SELECT public.report_focus_violation();
SELECT tests.admin();
SELECT tests.ok('violation costs exactly 5', (SELECT aura FROM public.profiles WHERE id = :'alice') = 95);

\echo '== store (E4)'
INSERT INTO public.store_items (name, category, aura_cost) VALUES ('Test Hat', 'cosmetic', 40) ON CONFLICT DO NOTHING;
UPDATE public.profiles SET aura = 100 WHERE id = :'alice';
SELECT tests.login(:'alice');
SELECT tests.ok('purchase works', (public.purchase_store_item((SELECT id FROM public.store_items WHERE name = 'Test Hat'))->>'success') = 'true');
SELECT tests.login(:'carol');   -- carol has 0 Aura
SELECT tests.ok('too poor -> error, no purchase', (public.purchase_store_item((SELECT id FROM public.store_items WHERE name = 'Test Hat'))->>'error') = 'Insufficient Aura');
SELECT tests.denied('cannot insert free purchases directly', format('INSERT INTO public.user_purchases (user_id, item_id, aura_spent) SELECT %L, id, 0 FROM public.store_items LIMIT 1', :'carol'));
SELECT tests.admin();
SELECT tests.ok('alice paid 40',                (SELECT aura FROM public.profiles WHERE id = :'alice') = 60);
SELECT tests.ok('purchase is in the aura log',  EXISTS (SELECT 1 FROM public.aura_log WHERE user_id = :'alice' AND delta = -40));
SELECT tests.ok('carol was not charged',        (SELECT aura FROM public.profiles WHERE id = :'carol') = 0);

\echo '== private quests: validation, ownership, daily XP cap (E5)'
SELECT tests.login(:'alice');
SELECT tests.denied('xp too high',        $$SELECT public.create_private_quest('t', null, 'focus', 5000, 25)$$);
SELECT tests.denied('bad skill type',     $$SELECT public.create_private_quest('t', null, 'hacking', 50, 25)$$);
SELECT tests.denied('empty title',        $$SELECT public.create_private_quest('   ', null, 'focus', 50, 25)$$);
SELECT tests.denied('zero minutes',       $$SELECT public.create_private_quest('t', null, 'focus', 50, 0)$$);
SELECT tests.denied('no direct insert',   format($$INSERT INTO public.private_quests (user_id, title, skill_type, status) VALUES (%L, 'x', 'focus', 'completed')$$, :'alice'));
SELECT tests.admin();
UPDATE public.profiles SET xp = 0 WHERE id = :'alice';
SELECT tests.login(:'alice');
CREATE TEMP TABLE pq AS SELECT public.create_private_quest('Quest ' || g, null, 'focus', 200, 25) AS id FROM generate_series(1, 4) g;
GRANT SELECT ON pq TO authenticated;
SELECT public.complete_private_quest(id) FROM pq;
SELECT public.complete_private_quest(id) FROM pq;       -- calling twice must not pay twice
SELECT tests.admin();
SELECT tests.ok('4 x 200 XP quests pay only the 500 daily cap', (SELECT xp FROM public.profiles WHERE id = :'alice') = 500);
SELECT tests.login(:'bob');
SELECT tests.denied('cannot complete someone else''s quest', format('SELECT public.complete_private_quest(%L)', (SELECT id FROM pq LIMIT 1)));
SELECT tests.login(:'alice');
SELECT public.create_private_quest('q' || g, null, 'focus', 10, 5) FROM generate_series(1, 26) g;   -- 26 + 0 active = 26 (4 done)
SELECT tests.denied('max 30 active private quests', $$SELECT public.create_private_quest('one too many', null, 'focus', 10, 5) FROM generate_series(1, 5)$$);

\echo '== diary / journal'
SELECT tests.admin();
UPDATE public.profiles SET xp = 0 WHERE id = :'bob';
SELECT tests.login(:'bob');
SELECT public.save_daily_entry('first draft');
SELECT public.save_daily_entry('edited');
SELECT tests.denied('empty entry rejected',          $$SELECT public.save_daily_entry('  ')$$);
SELECT tests.denied('3000-char entry rejected',      $$SELECT public.submit_daily_log(repeat('a', 3000))$$);
SELECT tests.ok('journal: first entry earns 25 XP',  (public.submit_daily_log('hello')->>'xp_awarded')::int = 25);
SELECT tests.ok('journal: second entry earns 0 XP',  (public.submit_daily_log('hello again')->>'xp_awarded')::int = 0);
SELECT tests.admin();
SELECT tests.ok('editing kept one dailies entry (+2 journal rows = 3)', (SELECT COUNT(*) FROM public.daily_logs WHERE user_id = :'bob') = 3);
SELECT tests.ok('bob has exactly 25 XP',             (SELECT xp FROM public.profiles WHERE id = :'bob') = 25);
SELECT tests.login(:'carol');
SELECT tests.ok('carol cannot read bob''s diary',    (SELECT COUNT(*) FROM public.daily_logs) = 0);

\echo '== parties (E6)'
SELECT tests.login(:'alice');
CREATE TEMP TABLE party AS SELECT public.create_party('Iron Crew', 'desc', '⚔', 2) AS id;
GRANT SELECT ON party TO authenticated;
SELECT tests.denied('cannot create a second party while in one', $$SELECT public.create_party('Other', null, '⚔', 4)$$);
SELECT tests.denied('no direct insert with fake pools', format($$INSERT INTO public.parties (name, leader_id, aura_pool, xp_pool) VALUES ('Rich', %L, 999999, 999999)$$, :'alice'));
SELECT tests.denied('no direct party update', $$UPDATE public.parties SET xp_pool = 999999$$);
SELECT tests.denied('leader cannot leave', 'SELECT public.leave_party()');
SELECT tests.login(:'bob');
SELECT tests.denied('duplicate party name -> unique error', $$SELECT public.create_party('Iron Crew', null, '⚔', 4)$$);
SELECT public.join_party((SELECT id FROM party));
SELECT tests.login(:'carol');
SELECT tests.denied('full party (max 2) rejects carol', format('SELECT public.join_party(%L)', (SELECT id FROM party)));
SELECT tests.login(:'bob');
SELECT tests.denied('cannot join twice', format('SELECT public.join_party(%L)', (SELECT id FROM party)));
SELECT tests.ok('directory shows 2 members', (SELECT member_count FROM public.party_directory WHERE name = 'Iron Crew') = 2);
SELECT tests.ok('directory shows leader name only (no profile columns)', (SELECT leader_username FROM public.party_directory WHERE name = 'Iron Crew') = 'alice');
SELECT tests.ok('bob sees only his own membership row', (SELECT COUNT(*) FROM public.party_members) = 1);
SELECT public.leave_party();
SELECT tests.admin();
SELECT tests.ok('bob left', (SELECT COUNT(*) FROM public.party_members) = 1);
SELECT tests.ok('pools are still zero', (SELECT xp_pool + aura_pool FROM public.parties WHERE name = 'Iron Crew') = 0);

\echo '== sign-up trigger (E17)'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'x1@test.io', '{"username": "Dup Name!"}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'x2@test.io', '{"username": "Dup Name!"}'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'x3@test.io', '{"username": "<script>"}'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'x4@test.io', '{"username": "ab"}');
SELECT tests.ok('username cleaned', EXISTS (SELECT 1 FROM public.profiles WHERE username = 'dup_name_'));
SELECT tests.ok('name clash gets a suffix instead of failing sign-up',
                (SELECT COUNT(*) FROM public.profiles WHERE username LIKE 'dup_name_%') = 2);
SELECT tests.ok('html characters stripped', (SELECT username FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003') = '_script_');
SELECT tests.ok('too-short names are replaced', (SELECT username FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000004') LIKE 'player\_%');

ROLLBACK;
