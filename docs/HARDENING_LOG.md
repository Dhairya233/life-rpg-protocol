# Hardening log

For each phase: (a) what changed, (b) why and which attack it stops, (c) how to verify, (d) how to roll back.
Rollback for every database phase = restore your pre-migration backup; for app code = `git revert`.

## Phase 0 – Audit
(a) Read every migration, route and client write. (b) Found the holes listed in `docs/SECURITY.md`.
(c) `MIGRATIONS_UPTO=020 TESTS=05 bash scripts/test-db.sh` → 44 failed attack checks on the original schema.
(d) Nothing changed.

## Phase 1 – Database lockdown (migrations 021–023, 022 is the key one)
(a) Reconciled schema drift; dropped all policies; revoked all grants; re-granted SELECT on own rows only;
column-level UPDATE on `profiles(username, theme)`; safe views; append-only `aura_log`.
(b) Stops: self-promotion to admin, editing own Aura/XP, reading other players' private fields.
(c) `bash scripts/test-db.sh` (needs a local DB named *test*). (d) Restore backup.
Note: this SQL was prepared before this session's app work; it was re-verified here, not rewritten.

## Phase 2 – Writes moved behind RPCs / validated routes
(a) Browser code now calls `start_quest`, `submit_quest_proof`, `cast_jury_vote`, `purchase_store_item`,
party functions, etc. Admin and AI routes validate with zod and check the caller. Removed `/api/aura/deduct`
and `/api/jury/vote`. (b) Stops forged rewards, mass assignment, unauthenticated admin/AI use.
(c) `npm run lint && npx tsc --noEmit && npm test && npm run build`; grep: `grep -rn "\.from(.*)\.\(insert\|update\|delete\)" app components hooks lib` should find no game-table writes.
(d) `git revert` the commit `6059bc7`.

## Phase 3 – Jury and economy integrity (migrations 023–024)
(a) Weight read from the DB; one vote each; no self-vote; locked, idempotent resolution; bounded rewards.
(b) Stops double payout, vote forgery, negative-Aura minting, restart-for-free-reward.
(c) Database tests, plus `supabase/tests/concurrency.sh` (two simultaneous deciding votes → paid once).
(d) Restore backup.

## Phase 4 – Private storage (migration 025)
(a) Private bucket, 5 MB, image types, own-folder path policy, signed 5-minute links from `/api/proofs/[id]`
after `get_proof_path_for_viewer` decides who may view. (b) Stops public photo access and overwriting others' files.
(c) Storage section of the DB tests. Verified against a stub only, see SECURITY.md. (d) Restore backup.

## Phase 5 – Honesty pass
(a) Labelled sample/AI/simulated features; removed false PWA/offline/immutable/zero-trust claims; fixed misleading comments.
(b) Recruiters and users should not be misled. (c) Read `docs/DECISIONS.md` list. (d) `git revert`.

## Phase 6 – Repo cleanup
(a) Removed junk (`mnt/`, `supabase/.temp`, build info); `.gitignore`; README; `.env.example`; docs moved to `docs/`;
package metadata; CI workflow; lint config. (c) lint, tsc, tests and build all pass (CI runs them). (d) `git revert`.

## Phase 7 – Independent review
(a) A separate reviewer read the SQL, routes and client code and tried to find holes. Result: none for a single user;
farming loop, legacy `proof_url`, and banned-route gaps fixed (migration 026, `lib/server/auth.ts`); the rest documented in SECURITY.md.
(c) `bash scripts/test-db.sh` (now includes the bonus-cap test). (d) Restore backup / `git revert`.
