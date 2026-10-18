#!/usr/bin/env bash
# ============================================================
# Race-condition test: two jurors cast the DECIDING votes at the same
# moment. Without row locking both would "resolve" the submission and
# pay the reward twice. With the lock in cast_jury_vote the second
# vote waits, then sees the submission is already decided and fails.
#
# Called by scripts/test-db.sh (needs DATABASE_URL, run after migrations).
# It needs two database sessions, which is why it is a shell script and
# not a .test.sql file. Uses its own committed fixtures (prefix "racer_");
# the next test run wipes the database.
# ============================================================
set -uo pipefail
q() { psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }

SUBMITTER='f1111111-1111-1111-1111-111111111111'
J1='f2222222-2222-2222-2222-222222222222'
J2='f3333333-3333-3333-3333-333333333333'
J3='f4444444-4444-4444-4444-444444444444'   # casts the deciding vote slowly
J4='f5555555-5555-5555-5555-555555555555'   # votes at the same moment
FILE="$SUBMITTER/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png"

echo "==> concurrency: two simultaneous deciding votes"

# ── Set-up (one session; \gset keeps the submission id in a variable) ──
q -v submitter="$SUBMITTER" -v j1="$J1" -v j2="$J2" -v file="$FILE" >/dev/null <<'SQL'
SELECT tests.admin();
SELECT tests.make_player(:'submitter', 'racer_submitter', 0);
SELECT tests.make_player('f2222222-2222-2222-2222-222222222222', 'racer_j1', 100);
SELECT tests.make_player('f3333333-3333-3333-3333-333333333333', 'racer_j2', 100);
SELECT tests.make_player('f4444444-4444-4444-4444-444444444444', 'racer_j3', 100);
SELECT tests.make_player('f5555555-5555-5555-5555-555555555555', 'racer_j4', 100);
UPDATE public.profiles SET luck = 0 WHERE username LIKE 'racer_%';   -- no random critical hit
INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', :'file');

SELECT tests.login(:'submitter');
SELECT public.start_quest((SELECT id FROM public.quests WHERE title = 'Deep Work Sprint'));
SELECT id AS uqid FROM public.user_quests WHERE user_id = :'submitter' \gset
SELECT public.submit_quest_proof(:'uqid', :'file');

SELECT tests.login(:'j1');
SELECT public.cast_jury_vote(:'uqid', true);
SELECT tests.login(:'j2');
SELECT public.cast_jury_vote(:'uqid', true);
SQL
[[ $? -eq 0 ]] || { echo "FAIL  concurrency fixtures could not be created"; exit 1; }

# Look the submission up as superuser (jurors cannot see other people's rows).
UQ="$(q -c "SELECT id FROM public.user_quests WHERE user_id = '$SUBMITTER'")"

ERR_FILE="$(mktemp)"

# Juror 3 casts the deciding vote and keeps the transaction open for 3 seconds.
q >/dev/null <<SQL &
BEGIN;
SELECT tests.login('$J3');
SELECT public.cast_jury_vote('$UQ', true);
SELECT pg_sleep(3);
COMMIT;
SQL
pid_a=$!

sleep 1   # make sure juror 3 holds the lock first

# Juror 4 votes while juror 3's transaction is still open: must wait, then be refused.
q >/dev/null 2>"$ERR_FILE" <<SQL
SELECT tests.login('$J4');
SELECT public.cast_jury_vote('$UQ', true);
SQL
b_status=$?
wait $pid_a

result="$(q -c "SELECT (SELECT xp FROM public.profiles WHERE id = '$SUBMITTER') || '/' ||
                       (SELECT COUNT(*) FROM public.aura_log WHERE user_id = '$SUBMITTER' AND reason = 'quest_complete') || '/' ||
                       (SELECT COUNT(*) FROM public.jury_votes WHERE user_quest_id = '$UQ')")"
rm -f "$ERR_FILE"

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
