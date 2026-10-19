-- ============================================================
-- TEST 30: quest lifecycle + jury integrity + admin actions
-- Covers audit items S3, S4, S5, E2, E3, E11, critical-hit crash
-- ============================================================
\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'
\set j1    'c1111111-1111-1111-1111-111111111111'
\set j2    'c2222222-2222-2222-2222-222222222222'
\set j3    'c3333333-3333-3333-3333-333333333333'
\set j4    'c4444444-4444-4444-4444-444444444444'
\set poor  'd1111111-1111-1111-1111-111111111111'
\set boss  'e1111111-1111-1111-1111-111111111111'
\set proof '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'

BEGIN;
SELECT tests.admin();
SELECT tests.make_player(:'alice', 'alice', 0);
SELECT tests.make_player(:'bob',   'bob',   150);
SELECT tests.make_player(:'j1', 'juror1', 100);
SELECT tests.make_player(:'j2', 'juror2', 100);
SELECT tests.make_player(:'j3', 'juror3', 100);
SELECT tests.make_player(:'j4', 'juror4', 100);
SELECT tests.make_player(:'poor', 'poorjuror', 50);
SELECT tests.make_player(:'boss', 'theadmin', 0);
UPDATE public.profiles SET role = 'admin' WHERE id = :'boss';
UPDATE public.profiles SET luck = 0;        -- 0% critical chance => results are deterministic
INSERT INTO storage.buckets (id, name) VALUES ('submissions', 'submissions') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', :'proof');

-- "Deep Work Sprint": 200 XP, 10 Aura (seeded in migration 008)
SELECT id AS quest FROM public.quests WHERE title = 'Deep Work Sprint' \gset

\echo '== starting a quest (S4)'
SELECT tests.login(:'alice');
SELECT tests.denied('cannot insert a completed quest directly', format($$INSERT INTO public.user_quests (user_id, quest_id, status) VALUES (%L, %L, 'completed')$$, :'alice', :'quest'));
CREATE TEMP TABLE uq AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq TO PUBLIC;
SELECT tests.ok('starting again just resumes (same id)', public.start_quest(:'quest') = (SELECT id FROM uq));
SELECT tests.denied('cannot edit status directly', $$UPDATE public.user_quests SET status = 'completed'$$);
SELECT tests.denied('cannot delete directly',      $$DELETE FROM public.user_quests$$);

\echo '== submitting proof (S3)'
SELECT tests.login(:'bob');
SELECT tests.denied('bob cannot submit proof for alice''s quest', format('SELECT public.submit_quest_proof(%L, %L)', (SELECT id FROM uq), :'proof'));
SELECT tests.login(:'alice');
SELECT tests.denied('path in someone else''s folder', format($$SELECT public.submit_quest_proof(%L, %L)$$, (SELECT id FROM uq), '22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'));
SELECT tests.denied('a URL instead of a path',        format($$SELECT public.submit_quest_proof(%L, 'https://evil.example/x.png')$$, (SELECT id FROM uq)));
SELECT tests.denied('file that was never uploaded',   format($$SELECT public.submit_quest_proof(%L, %L)$$, (SELECT id FROM uq), '11111111-1111-1111-1111-111111111111/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png'));
SELECT public.submit_quest_proof((SELECT id FROM uq), :'proof');
SELECT tests.denied('cannot submit twice',            format('SELECT public.submit_quest_proof(%L, %L)', (SELECT id FROM uq), :'proof'));
SELECT tests.denied('cannot restart a pending quest (E3)', format('SELECT public.start_quest(%L)', :'quest'));
SELECT tests.denied('cannot abandon a pending quest',  format('SELECT public.abandon_quest(%L)', (SELECT id FROM uq)));

\echo '== who may judge (S5)'
SELECT tests.login(:'alice');
SELECT tests.ok('submitter does not see own submission in the queue', (SELECT COUNT(*) FROM public.get_jury_queue()) = 0);
SELECT tests.denied('submitter cannot vote on own work', format('SELECT public.cast_jury_vote(%L, true)', (SELECT id FROM uq)));
SELECT tests.login(:'poor');
SELECT tests.ok('juror with 50 Aura gets an empty queue', (SELECT COUNT(*) FROM public.get_jury_queue()) = 0);
SELECT tests.denied('juror with 50 Aura cannot vote', format('SELECT public.cast_jury_vote(%L, true)', (SELECT id FROM uq)));
SELECT tests.denied('cannot insert a vote directly with a fake weight', format('INSERT INTO public.jury_votes (user_quest_id, juror_id, vote, juror_aura_snapshot) VALUES (%L, %L, true, 999999)', (SELECT id FROM uq), :'poor'));
SELECT tests.anon();
SELECT tests.denied('anon cannot read the queue', 'SELECT * FROM public.get_jury_queue()');
SELECT tests.admin();
UPDATE public.profiles SET is_banned = TRUE WHERE id = :'j4';
SELECT tests.login(:'j4');
SELECT tests.denied('banned juror cannot vote', format('SELECT public.cast_jury_vote(%L, true)', (SELECT id FROM uq)));
SELECT tests.admin();
UPDATE public.profiles SET is_banned = FALSE WHERE id = :'j4';

\echo '== queue + proof access'
SELECT tests.login(:'j1');
SELECT tests.ok('eligible juror sees the submission', (SELECT COUNT(*) FROM public.get_jury_queue()) = 1);
SELECT tests.ok('queue shows only safe fields (username, no ids of the submitter)',
                (SELECT submitter_username FROM public.get_jury_queue()) = 'alice');
SELECT tests.ok('juror may view the proof file', public.get_proof_path_for_viewer((SELECT id FROM uq)) = :'proof');
SELECT tests.login(:'poor');
SELECT tests.ok('ineligible user may NOT view the proof', public.get_proof_path_for_viewer((SELECT id FROM uq)) IS NULL);
SELECT tests.login(:'alice');
SELECT tests.ok('owner may view own proof', public.get_proof_path_for_viewer((SELECT id FROM uq)) = :'proof');
SELECT tests.denied('jurors cannot read others'' pending rows directly', $$SELECT 1 / (SELECT COUNT(*) FROM public.user_quests WHERE user_id <> auth.uid())$$);

\echo '== voting + verdict (S5, E2): approved'
SELECT tests.login(:'j1'); SELECT tests.ok('1st vote: waiting for quorum', (public.cast_jury_vote((SELECT id FROM uq), true)->>'resolution') = 'insufficient_votes');
SELECT tests.denied('same juror cannot vote twice', format('SELECT public.cast_jury_vote(%L, true)', (SELECT id FROM uq)));
SELECT tests.ok('voted submission leaves j1''s queue', (SELECT COUNT(*) FROM public.get_jury_queue()) = 0);
SELECT tests.login(:'j2'); SELECT tests.ok('2nd vote: still waiting', (public.cast_jury_vote((SELECT id FROM uq), true)->>'resolution') = 'insufficient_votes');
SELECT tests.login(:'j3'); SELECT tests.ok('3rd vote reaches quorum -> approved', (public.cast_jury_vote((SELECT id FROM uq), true)->>'resolution') = 'approved');
SELECT tests.admin();
SELECT tests.ok('submitter got 200 XP',        (SELECT xp FROM public.profiles WHERE id = :'alice') = 200);
SELECT tests.ok('submitter got 10 Aura',       (SELECT aura FROM public.profiles WHERE id = :'alice') = 10);
SELECT tests.ok('agreeing jurors got +10 XP / +2 Aura', (SELECT xp = 10 AND aura = 102 FROM public.profiles WHERE id = :'j1'));
SELECT tests.ok('status is completed',         (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq)) = 'completed');

\echo '== replay attacks (E2, E3)'
SELECT tests.ok('resolving again pays nothing (idempotent)', public._resolve_verdict((SELECT id FROM uq)) = 'already_resolved');
SELECT tests.ok('...and again',                              public._resolve_verdict((SELECT id FROM uq)) = 'already_resolved');
SELECT tests.ok('XP unchanged after replays', (SELECT xp FROM public.profiles WHERE id = :'alice') = 200);
SELECT tests.login(:'j4');
SELECT tests.denied('cannot vote after the decision', format('SELECT public.cast_jury_vote(%L, true)', (SELECT id FROM uq)));
SELECT tests.login(:'alice');
SELECT tests.denied('cannot restart a completed quest (free second payout)', format('SELECT public.start_quest(%L)', :'quest'));
SELECT tests.denied('cannot abandon a completed quest',                       format('SELECT public.abandon_quest(%L)', (SELECT id FROM uq)));

\echo '== rejected + retry'
SELECT tests.admin();
DELETE FROM public.user_quests;                       -- fresh start for the next scenarios (superuser)
UPDATE public.profiles SET aura = 100 WHERE id IN (:'j1', :'j2', :'j3', :'j4');
UPDATE public.profiles SET aura = 50, xp = 0 WHERE id = :'alice';
SELECT tests.login(:'alice');
CREATE TEMP TABLE uq2 AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq2 TO PUBLIC;
SELECT public.submit_quest_proof((SELECT id FROM uq2), :'proof');
SELECT tests.login(:'j1'); SELECT public.cast_jury_vote((SELECT id FROM uq2), false);
SELECT tests.login(:'j2'); SELECT public.cast_jury_vote((SELECT id FROM uq2), false);
SELECT tests.login(:'j3'); SELECT tests.ok('3 rejections -> rejected', (public.cast_jury_vote((SELECT id FROM uq2), false)->>'resolution') = 'rejected');
SELECT tests.admin();
SELECT tests.ok('submitter lost 20 Aura', (SELECT aura FROM public.profiles WHERE id = :'alice') = 30);
SELECT tests.ok('status is failed',       (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq2)) = 'failed');
SELECT tests.login(:'alice');
SELECT tests.ok('a failed quest may be retried (same row)', public.start_quest(:'quest') = (SELECT id FROM uq2));
SELECT tests.admin();
SELECT tests.ok('retry starts with a fresh jury (old votes gone)', (SELECT COUNT(*) FROM public.jury_votes) = 0);
SELECT tests.ok('retry is active again', (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq2)) = 'active');
SELECT tests.login(:'alice');
SELECT public.abandon_quest((SELECT id FROM uq2));
SELECT tests.admin();
SELECT tests.ok('active quest can be abandoned', (SELECT COUNT(*) FROM public.user_quests) = 0);

\echo '== tie / inconclusive, then more votes decide'
-- weights: j1 = 200 (approve), j2 = 100 (reject), j3 = 100 (reject)  => 200/400 = 0.50
UPDATE public.profiles SET aura = 200 WHERE id = :'j1';
UPDATE public.profiles SET aura = 200 WHERE id = :'j4';
SELECT tests.login(:'alice');
CREATE TEMP TABLE uq3 AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq3 TO PUBLIC;
SELECT public.submit_quest_proof((SELECT id FROM uq3), :'proof');
SELECT tests.login(:'j1'); SELECT public.cast_jury_vote((SELECT id FROM uq3), true);
SELECT tests.login(:'j2'); SELECT public.cast_jury_vote((SELECT id FROM uq3), false);
SELECT tests.login(:'j3'); SELECT tests.ok('50/50 -> inconclusive', (public.cast_jury_vote((SELECT id FROM uq3), false)->>'resolution') = 'inconclusive');
SELECT tests.admin();
SELECT tests.ok('inconclusive stays pending', (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq3)) = 'pending_verification');
SELECT tests.login(:'j4'); SELECT tests.ok('another juror breaks the tie -> approved', (public.cast_jury_vote((SELECT id FROM uq3), true)->>'resolution') = 'approved');

\echo '== critical hit (used to crash on the CHECK constraint)'
SELECT tests.admin();
DELETE FROM public.user_quests;
UPDATE public.profiles SET luck = 100, xp = 0, aura = 0 WHERE id = :'alice';
UPDATE public.profiles SET aura = 100 WHERE id IN (:'j1', :'j2', :'j3');
SELECT tests.login(:'alice');
CREATE TEMP TABLE uq4 AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq4 TO PUBLIC;
SELECT public.submit_quest_proof((SELECT id FROM uq4), :'proof');
SELECT tests.login(:'j1'); SELECT public.cast_jury_vote((SELECT id FROM uq4), true);
SELECT tests.login(:'j2'); SELECT public.cast_jury_vote((SELECT id FROM uq4), true);
SELECT tests.login(:'j3'); SELECT tests.ok('luck 100 -> critical hit approved', (public.cast_jury_vote((SELECT id FROM uq4), true)->>'resolution') = 'approved_critical');
SELECT tests.admin();
SELECT tests.ok('critical hit pays 1.5x XP (300)', (SELECT xp FROM public.profiles WHERE id = :'alice') = 300);
SELECT tests.ok('status completed_critical stored', (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq4)) = 'completed_critical');

\echo '== admin actions (server-only)'
DELETE FROM public.user_quests;
UPDATE public.profiles SET aura = 100, xp = 0 WHERE id = :'alice';
SELECT tests.login(:'alice');
CREATE TEMP TABLE uq5 AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq5 TO PUBLIC;
SELECT public.submit_quest_proof((SELECT id FROM uq5), :'proof');
SELECT tests.denied('logged-in user cannot call admin_resolve_submission', format($$SELECT public.admin_resolve_submission(%L, %L, 'approve')$$, :'alice', (SELECT id FROM uq5)));
SELECT tests.service();
SELECT tests.denied('service role + NON-admin id is refused', format($$SELECT public.admin_resolve_submission(%L, %L, 'approve')$$, :'bob', (SELECT id FROM uq5)));
SELECT tests.denied('unknown action refused',                 format($$SELECT public.admin_resolve_submission(%L, %L, 'delete')$$, :'boss', (SELECT id FROM uq5)));
SELECT tests.ok('admin can approve', public.admin_resolve_submission(:'boss', (SELECT id FROM uq5), 'approve') = 'approve');
SELECT tests.denied('cannot settle the same submission twice', format($$SELECT public.admin_resolve_submission(%L, %L, 'approve')$$, :'boss', (SELECT id FROM uq5)));
SELECT tests.admin();
SELECT tests.ok('approval paid 200 XP once', (SELECT xp FROM public.profiles WHERE id = :'alice') = 200);

SELECT tests.service();
SELECT tests.allowed('admin can edit xp/aura/ban', format('SELECT public.admin_update_player(%L, %L, 1000, 250, true)', :'boss', :'alice'));
SELECT tests.denied('admin cannot ban an admin',  format('SELECT public.admin_update_player(%L, %L, 0, 0, true)', :'boss', :'boss'));
SELECT tests.denied('xp out of range refused',    format('SELECT public.admin_update_player(%L, %L, -1, 0, false)', :'boss', :'alice'));
SELECT tests.admin();
SELECT tests.ok('role was NOT changed by the admin tool', (SELECT role FROM public.profiles WHERE id = :'alice') = 'user');
SELECT tests.ok('manual Aura change is in the log', EXISTS (SELECT 1 FROM public.aura_log WHERE user_id = :'alice' AND reason LIKE 'admin_adjustment by %'));

\echo '== jury bonus is capped per day (anti-farming)'
\set bobproof '22222222-2222-2222-2222-222222222222/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png'
SELECT tests.admin();
INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', :'bobproof');
DELETE FROM public.user_quests;
UPDATE public.profiles SET aura = 100, xp = 0 WHERE id IN (:'j1', :'j2', :'j3', :'bob');
INSERT INTO public.aura_log (user_id, delta, reason)
  SELECT :'j1', 2, 'jury_bonus' FROM generate_series(1, 10);
SELECT tests.login(:'bob');
CREATE TEMP TABLE uq6 AS SELECT public.start_quest(:'quest') AS id;
GRANT SELECT ON uq6 TO PUBLIC;
SELECT public.submit_quest_proof((SELECT id FROM uq6), :'bobproof');
SELECT tests.login(:'j1'); SELECT public.cast_jury_vote((SELECT id FROM uq6), false);
SELECT tests.login(:'j2'); SELECT public.cast_jury_vote((SELECT id FROM uq6), false);
SELECT tests.login(:'j3'); SELECT public.cast_jury_vote((SELECT id FROM uq6), false);
SELECT tests.admin();
SELECT tests.ok('rejection resolved', (SELECT status FROM public.user_quests WHERE id = (SELECT id FROM uq6)) = 'failed');
SELECT tests.ok('juror under the cap still gets the bonus', (SELECT xp FROM public.profiles WHERE id = :'j2') = 10);
SELECT tests.ok('juror over the daily cap gets NO bonus',   (SELECT xp FROM public.profiles WHERE id = :'j1') = 0);

ROLLBACK;
