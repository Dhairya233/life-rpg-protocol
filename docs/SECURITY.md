# Security notes

This is the authoritative description of how the app is protected. It replaces the security claims in the
older design documents. Everything marked **tested** is covered by a test you can run yourself.

## How to check it yourself

```bash
npm run lint && npm run typecheck && npm test      # app checks
DATABASE_URL='postgres://postgres@localhost:5432/liferpg_test' npm run test:db   # ~250 database security tests
```

`test:db` applies every migration to an empty **local** Postgres (with small stand-ins for Supabase's roles,
`auth` and `storage`) and then *attacks* it. To see the tests catch the original holes, run only the attack
file against the original schema: `MIGRATIONS_UPTO=020 TESTS=05 npm run test:db` → 44 failures; against the
final schema → 0.

## The model in four sentences

1. The browser is **untrusted**. It holds the public anon key, so anyone can call the database API directly.
2. Therefore the **database** enforces the rules: no browser may write game tables; every game action is a
   function that takes the user from the verified login (`auth.uid()`), validates input and bounds values.
3. The few things that need extra power (admin actions, signing proof links) run in **server routes**
   that check the caller first and are the only code that holds the service-role key.
4. Roles (`admin`) can only be changed by someone running SQL on the database.

## What was vulnerable, and how it is fixed

| # | Problem (original) | Attack | Fix | Tested |
|---|---|---|---|---|
| S1 | Users could `UPDATE` any column of their own profile | Set own `aura`, `xp`, `role='admin'`, `is_banned`… | Column grants: only `username`, `theme` | yes |
| S2 | Definer functions took `p_user_id`, PUBLIC could execute them | Anyone (even logged out) grants rewards or deducts Aura for any user | Rewritten: identity from `auth.uid()`, `REVOKE` from PUBLIC/anon/authenticated, explicit `GRANT`s | yes |
| E1 | `deduct_aura(-1000)` | Negative deduction minted Aura | Internal helper, range 1–500, not client-callable | yes |
| S3 | `submit_quest_proof` had no ownership/status checks | Overwrite someone else's proof; skip the timer | Owner + `active` status + file must exist in your own folder | yes |
| S4 | `user_quests` writable by its owner | Insert/update a quest as `completed`; delete it to erase votes | No client writes; `start_quest`, `submit_quest_proof`, `abandon_quest` only | yes |
| S5/E2 | `resolve_verdict` callable by anyone, repeatable | Re-run it to re-pay rewards; two simultaneous votes pay twice | Internal, idempotent, row-locked; only `cast_jury_vote` calls it | yes (incl. race test) |
| E3 | `start_quest` reset completed quests but kept old votes | Free second payout with old votes | Completed/pending quests cannot restart; a retry deletes old votes | yes |
| S5 | Votes inserted directly | Fake vote weight; self-vote; vote on non-pending quest | `cast_jury_vote` reads weight from DB, blocks self/duplicate/non-pending, requires ≥100 Aura | yes |
| S6 | `profiles` readable by everyone | Read every player's `role`, `is_banned`, `luck` — even logged out | Own row only; public data via `leaderboard` / `party_directory` views | yes |
| E4 | Store purchase took a user id; purchases table writable | Spend someone else's Aura; add free items | `purchase_store_item(item)` uses `auth.uid()`; no client writes | yes |
| E5 | Private quests editable, uncapped | Edit `completed_at` to dodge the daily cap; farm Aura | Creation/completion via functions; Aura fixed at 0; max 500 XP/day, max 30 active | yes |
| E6 | Parties writable | Choose own `xp_pool`/`aura_pool` | `create_party/join_party/leave_party`; pools start at 0, clients cannot set them | yes |
| E11 | `is_banned` never checked | Banned users kept playing | Every user function rejects banned accounts | yes |
| E14 | Luck boost unlimited and client-callable | Guaranteed critical hits | Server-only, +10/day via Daily Discovery, capped at 50 | yes |
| E16 | `aura_log` editable by owner role, "immutable" claim | Rewrite history | Append-only trigger (also blocks TRUNCATE) | yes |
| S7 | Direct client writes everywhere | Any of the above | All replaced by RPCs or validated server routes (zod) | review |
| S8 | Proof bucket: code used public URLs, docs said private | Public or broken images | Bucket forced private, 5 MB, images only, strict path policy, 5-minute signed links | yes |
| E7 | `/api/generate-plan` unauthenticated | Burn LLM credits | Login required, 10 req/hour/user (best effort), output validated | review |
| E8 | Next.js 14.2.4 | Middleware auth bypass (CVE-2025-29927) | Upgraded to 14.2.35; admin checks live in the routes, not only the layout | n/a |
| E17 | Sign-up copied a user-chosen username into a unique column | Sign-up failure/DoS, odd characters | Username cleaned and made unique automatically | yes |

"review" = verified by reading the code, not by an automated test.

## Honest limits (things this does NOT protect against)

- **The focus jail is client-side.** The server never sees a tab switch, so a determined user can bypass
  it. It is a deterrent. Making it enforceable would need a server-side heartbeat (proposed, not built).
- **Nothing proves the work was done.** A quest's proof is a photo judged by other players. Colluding
  accounts with ≥100 Aura each can approve each other. Weighting by Aura raises the cost, not to infinity.
  Mitigation ideas (not built): account-age requirement, pairing limits, random juror assignment.
- **Nothing checks the timer on the server.** A player can submit proof for a quest immediately after
  starting it. (Adding a minimum elapsed time would be a one-line check in `submit_quest_proof`; it is a
  gameplay decision, so it was left out.)
- **`aura_log` is tamper-resistant, not tamper-proof.** The database owner can drop the trigger.
- **The in-memory rate limit** on `/api/generate-plan` is per server instance and resets on restart.
- **No CSP.** Basic security headers are set; a Content-Security-Policy needs a nonce setup.
- **Remaining npm advisories:** `npm audit` still reports Next.js 14 issues (image-optimizer / request
  deserialization DoS, self-hosted only) whose fix is Next 16. The app does not use the image optimizer.
  Upgrading Next 16 is a separate migration.
- **The leaderboard and party views run as their owner** (so they can read profiles). Supabase's linter
  flags such views; here it is deliberate and they expose only safe columns.
- **Not verified on a real Supabase project.** Tests ran on plain Postgres 16 with stand-ins for Supabase's
  roles/auth/storage. Storage policies and Realtime behave the same in principle, but have not been
  exercised against Supabase's real Storage API.

## Rolling this out on a real project (read before running migrations)

1. **Work on a copy first** (a staging project, or `supabase start`). Never try this on production first.
2. **Back up**: `pg_dump` the database before running anything. Migrations are forward-only; rolling back
   means restoring the backup (plus `git revert` for the app).
3. Migration **022 drops every policy in `public`** (also ones created by hand in the dashboard) and revokes
   all grants. If the live database has features that relied on a hand-made policy, they will stop working
   until a function or grant is added on purpose.
4. Migration **021** adds `CHECK` constraints as `NOT VALID` (new rows are checked, old rows are not).
   Migration **025** turns old `proof_url` values from full URLs into storage paths.
5. Set the server env var `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`) before deploying the app, otherwise
   admin routes and proof images return errors.
6. Make yourself admin with SQL (see README). Rotate the service-role key if it was ever pasted anywhere.
7. Compare your real schema with `docs/SCHEMA_SNAPSHOT.md`: the repo's early migrations did not match the app
   (e.g. `daily_logs` was missing), so a live database may contain extra tables or columns.
