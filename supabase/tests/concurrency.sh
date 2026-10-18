#!/usr/bin/env bash
# ============================================================
# Race-condition test: two jurors cast the DECIDING votes at the same
# moment. Without row locking both would "resolve" the submission and
# pay the reward twice. With the lock in cast_jury_vote the second
# vote waits, then sees the submission is already decided and fails.
#
# Called by scripts/test-db.sh (needs DATABASE_URL, run after migrations).
# Uses its own committed fixtures; the next test run wipes the database.
# ============================================================
set -uo pipefail
q() { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

echo "==> concurrency: two simultaneous deciding votes"

q >/dev/null <<'SQL'
SELECT tests.admin();
SELECT tests.make_player('f1111111-1111-1111-1111-111111111111', 'racer_submitter', 0);
SELECT tests.make_player('f2222222-2222-2222-2222-222222222222', 'racer_j1', 100);
SELECT tests.make_player('f3333333-3333-3333-3333-333333333333', 'racer_j2', 100);
SELECT tests.make_player('f4444444-4444-4444-4444-444444444444', 'racer_j3', 100);
SELECT tests.make_player('f5555555-5555-5555-5555-555555555555', 'racer_j4', 100);
UPDATE public.profiles SET luck = 0;
INSERT INTO storage.objects (bucket_id, name)
  VALUES ('submissions', 'f1111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');

SELECT tests.login('f1111111-1111-1111-1111-111111111111');
SELECT public.start_quest((SELECT id FROM public.quests WHERE title = 'Deep Work Sprint'));
SELECT public.submit_quest_proof(
  (SELECT id FROM public.user_quests LIMIT 1),
  'f1111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
SELECT tests.login('f2222222-2222-2222-2222-222222222222');
SELECT public.cast_jury_vote((SELECT id FROM public.user_quests LIMIT 1), true);
SELECT tests.login('f3333333-3333-3333-3333-333333333333');
SELECT public.cast_jury_vote((SELECT id FROM public.user_quests LIMIT 1), true);
SQL
[[ $? -eq 0 ]] || { echo "FAIL  concurrency fixtures could not be created"; exit 1; }

# Juror 3 casts the deciding vote and holds the transaction open for 3 seconds.
q >/dev/null <<'SQL' &
BEGIN;
SELECT tests.login('f4444444-4444-4444-4444-444444444444');
SELECT public.cast_jury_vote((SELECT id FROM public.user_quests LIMIT 1), true);
SELECT pg_sleep(3);
COMMIT;
SQL
pid_a=$!

sleep 1   # make sure juror 3 holds the lock first

# Juror 4 votes while juror 3's transaction is still open.
q >/dev/null 2>/tmp/liferpg_race_b.err <<'SQL'
SELECT tests.login('f5555555-5555-5555-5555-555555555555');
SELECT public.cast_jury_vote((SELECT id FROM public.user_quests LIMIT 1), true);
SQL
b_status=$?
wait $pid_a

result="$(q -c "SELECT (SELECT xp FROM public.profiles WHERE username = 'racer_submitter') || '/' ||
                       (SELECT COUNT(*) FROM public.aura_log WHERE reason = 'quest_complete') || '/' ||
                       (SELECT COUNT(*) FROM public.jury_votes)")"
rm -f /tmp/liferpg_race_b.err

fail=0
if [[ "$result" == "200/1/3" ]]; then
  echo "ok    reward paid exactly once (xp/rewards/votes = $result)"
else
  echo "FAIL  expected xp/rewards/votes = 200/1/3 but got $result"; fail=1
fi
if [[ $b_status -ne 0 ]]; then
  echo "ok    the late vote was rejected after the decision"
else
  echo "FAIL  the late vote was accepted"; fail=1
fi
exit $fail
