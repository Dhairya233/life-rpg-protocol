# Database schema snapshot

> **Generated from the migrations**, not written by hand: all of `supabase/migrations/001…025` were applied to
> an empty Postgres and the catalog was read back. It describes the database *after* migration 025.
> The full SQL dump is in [`schema_snapshot.sql`](schema_snapshot.sql).
>
> To regenerate: apply the migrations to a scratch database (`npm run test:db` does this), then
> `pg_dump -s -n public --no-owner <db> > docs/schema_snapshot.sql`.

## The security rules in one minute

1. **Deny by default.** `anon` (not logged in) has no access to any table or function. `authenticated`
   (logged in) may only **read** tables, and only its own rows (plus a few safe views).
2. **No browser writes** to game tables. The only column a browser may update is `profiles.username` / `profiles.theme`.
3. **Every game action is a function** that takes the user from `auth.uid()`, validates input, and
   writes inside one transaction. Functions starting with `_` are internal and not callable from a browser.
4. **Every `SECURITY DEFINER` function pins `search_path`** and has its `EXECUTE` right granted to
   exactly the roles that need it.
5. `aura_log` is append-only (trigger). Quests/XP/Aura bounds are enforced in functions and `CHECK` constraints.

## Tables and views

"Browser access" is what a logged-in or anonymous browser may do **before** Row Level Security
filters the rows (see the policy table below).

### `aura_log`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `delta` | integer | not null |
| `reason` | text | not null |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `daily_discoveries`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `image_url` | text | not null |
| `analysis_summary` | text | not null |
| `luck_granted` | integer | not null default 10 |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `daily_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `entry` | text | not null |
| `xp_awarded` | integer | not null default 0 |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `daily_luck_rolls`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `roll_date` | date | not null default CURRENT_DATE |
| `luck_value` | integer | not null |
| `is_grind_day` | boolean | not null default false |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `jury_votes`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_quest_id` | uuid | not null |
| `juror_id` | uuid | not null |
| `vote` | boolean | not null |
| `juror_aura_snapshot` | integer | not null |
| `created_at` | timestamp with time zone | not null default now() |
| `verdict_match` | boolean |  |

Browser access: SELECT (logged in), none (anonymous)

### `leaderboard`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid |  |
| `username` | text |  |
| `aura` | integer |  |
| `xp` | integer |  |
| `level` | integer |  |
| `streak_days` | integer |  |
| `created_at` | timestamp with time zone |  |

Browser access: SELECT (logged in), none (anonymous)

### `parties`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `name` | text | not null |
| `description` | text |  |
| `emblem` | text | default '⚔'::text |
| `leader_id` | uuid | not null |
| `max_members` | integer | not null default 6 |
| `aura_pool` | integer | not null default 0 |
| `xp_pool` | integer | not null default 0 |
| `is_recruiting` | boolean | not null default true |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `party_directory`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid |  |
| `name` | text |  |
| `description` | text |  |
| `emblem` | text |  |
| `leader_id` | uuid |  |
| `leader_username` | text |  |
| `max_members` | integer |  |
| `aura_pool` | integer |  |
| `xp_pool` | integer |  |
| `is_recruiting` | boolean |  |
| `created_at` | timestamp with time zone |  |
| `member_count` | integer |  |

Browser access: SELECT (logged in), none (anonymous)

### `party_members`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `party_id` | uuid | not null |
| `user_id` | uuid | not null |
| `role` | text | not null default 'member'::text |
| `joined_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `party_quests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `party_id` | uuid | not null |
| `title` | text | not null |
| `description` | text |  |
| `target_count` | integer | not null default 1 |
| `current_count` | integer | not null default 0 |
| `xp_pool_reward` | integer | not null default 500 |
| `status` | text | not null default 'active'::text |
| `expires_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `private_quests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `title` | text | not null |
| `description` | text |  |
| `skill_type` | text | not null |
| `xp_reward` | integer | not null default 50 |
| `aura_reward` | integer | not null default 0 |
| `duration_minutes` | integer | not null default 25 |
| `status` | text | not null default 'active'::text |
| `completed_at` | timestamp with time zone |  |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null |
| `username` | text | not null |
| `aura` | integer | not null default 0 |
| `xp` | integer | not null default 0 |
| `level` | integer | not null default 1 |
| `luck` | integer | not null default 50 |
| `theme` | text | not null default 'classic'::text |
| `streak_days` | integer | not null default 0 |
| `last_active` | date |  |
| `created_at` | timestamp with time zone | not null default now() |
| `active_luck_boost` | integer | default 0 |
| `role` | text | not null default 'user'::text |
| `is_banned` | boolean | not null default false |

Browser access: SELECT (logged in), none (anonymous)

### `quests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `title` | text | not null |
| `description` | text |  |
| `difficulty` | text | not null |
| `skill_type` | text | not null |
| `xp_reward` | integer | not null |
| `aura_reward` | integer | not null default 0 |
| `duration_minutes` | integer | not null |
| `requires_proof` | boolean | not null default true |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `store_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `name` | text | not null |
| `description` | text |  |
| `category` | text | not null default 'cosmetic'::text |
| `aura_cost` | integer | not null |
| `icon` | text | default '✦'::text |
| `is_available` | boolean | not null default true |
| `effect_meta` | jsonb |  |
| `created_at` | timestamp with time zone | not null default now() |

Browser access: SELECT (logged in), none (anonymous)

### `user_purchases`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `item_id` | uuid | not null |
| `aura_spent` | integer | not null |
| `purchased_at` | timestamp with time zone | not null default now() |
| `expires_at` | timestamp with time zone |  |

Browser access: SELECT (logged in), none (anonymous)

### `user_quests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | not null default gen_random_uuid() |
| `user_id` | uuid | not null |
| `quest_id` | uuid | not null |
| `status` | text | not null default 'idle'::text |
| `proof_url` | text |  |
| `started_at` | timestamp with time zone |  |
| `completed_at` | timestamp with time zone |  |
| `aura_penalty` | integer | not null default 0 |
| `jury_verdict` | numeric(4,3) |  |
| `created_at` | timestamp with time zone | not null default now() |
| `proof_submitted_at` | timestamp with time zone |  |

Browser access: SELECT (logged in), none (anonymous)


## Functions (public schema)

| Function | Who may call it |
|---|---|
| `_add_luck_boost(p_user_id uuid, p_amount integer)` | server only (service role / other database functions) |
| `_assert_admin(p_admin_id uuid)` | server only (service role / other database functions) |
| `_current_player()` | server only (service role / other database functions) |
| `_deduct_aura(p_user_id uuid, p_amount integer, p_reason text)` | server only (service role / other database functions) |
| `_grant_rewards(p_user_id uuid, p_xp integer, p_aura integer, p_reason text)` | server only (service role / other database functions) |
| `_lock_player(p_user_id uuid)` | server only (service role / other database functions) |
| `_resolve_verdict(p_user_quest_id uuid)` | server only (service role / other database functions) |
| `abandon_quest(p_user_quest_id uuid)` | logged-in users |
| `admin_resolve_submission(p_admin_id uuid, p_user_quest_id uuid, p_action text)` | server only (service role / other database functions) |
| `admin_update_player(p_admin_id uuid, p_user_id uuid, p_xp integer, p_aura integer, p_is_banned boolean)` | server only (service role / other database functions) |
| `block_aura_log_changes()` | server only (service role / other database functions) |
| `cast_jury_vote(p_user_quest_id uuid, p_vote boolean)` | logged-in users |
| `claim_daily_discovery(p_image_ref text, p_summary text)` | logged-in users |
| `complete_private_quest(p_quest_id uuid)` | logged-in users |
| `create_party(p_name text, p_description text, p_emblem text, p_max_members integer)` | logged-in users |
| `create_private_quest(p_title text, p_description text, p_skill_type text, p_xp_reward integer, p_duration_minutes integer)` | logged-in users |
| `get_jury_queue()` | logged-in users |
| `get_proof_path_for_viewer(p_user_quest_id uuid)` | logged-in users |
| `handle_new_user()` | server only (service role / other database functions) |
| `join_party(p_party_id uuid)` | logged-in users |
| `leave_party()` | logged-in users |
| `purchase_store_item(p_item_id uuid)` | logged-in users |
| `report_focus_violation()` | logged-in users |
| `roll_daily_luck()` | logged-in users |
| `save_daily_entry(p_entry text)` | logged-in users |
| `start_quest(p_quest_id uuid)` | logged-in users |
| `submit_daily_log(p_entry text)` | logged-in users |
| `submit_quest_proof(p_user_quest_id uuid, p_proof_path text)` | logged-in users |
| `update_level()` | server only (service role / other database functions) |
| `update_streak()` | logged-in users |

## Row Level Security policies

| Table | Policy | Command | Condition (INSERT policies: see the check in migration 025) |
|---|---|---|---|
| `aura_log` | `aura_log_select_own` | SELECT | (user_id = auth.uid()) |
| `daily_discoveries` | `daily_discoveries_select_own` | SELECT | (user_id = auth.uid()) |
| `daily_logs` | `daily_logs_select_own` | SELECT | (user_id = auth.uid()) |
| `daily_luck_rolls` | `daily_luck_rolls_select_own` | SELECT | (user_id = auth.uid()) |
| `jury_votes` | `jury_votes_select_own` | SELECT | (juror_id = auth.uid()) |
| `objects` | `submissions_delete_own` | DELETE | ((bucket_id = 'submissions'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)) |
| `objects` | `submissions_read_own` | SELECT | ((bucket_id = 'submissions'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)) |
| `objects` | `submissions_upload_own` | INSERT |  |
| `parties` | `parties_select` | SELECT | true |
| `party_members` | `party_members_select_own` | SELECT | (user_id = auth.uid()) |
| `party_quests` | `party_quests_select_members` | SELECT | (EXISTS ( SELECT 1
   FROM party_members m
  WHERE ((m.party_id = party_quests.party_id) AND (m.user_id = auth.uid())))) |
| `private_quests` | `private_quests_select_own` | SELECT | (user_id = auth.uid()) |
| `profiles` | `profiles_select_own` | SELECT | (id = auth.uid()) |
| `profiles` | `profiles_update_own` | UPDATE | (id = auth.uid()) |
| `quests` | `quests_select` | SELECT | true |
| `store_items` | `store_items_select` | SELECT | true |
| `user_purchases` | `user_purchases_select_own` | SELECT | (user_id = auth.uid()) |
| `user_quests` | `user_quests_select_own` | SELECT | (user_id = auth.uid()) |

## Jury rules (enforced in `cast_jury_vote` / `_resolve_verdict`)

| Rule | Value |
|---|---|
| Who can vote | logged in, not banned, **>= 100 Aura**, not the submitter |
| Votes per juror per submission | 1 (unique constraint) |
| Vote weight | juror's Aura, read from the database at vote time |
| Quorum | at least 3 votes before anything is decided |
| Approved | weighted approval share **>= 0.60** (submitter gets rewards; critical hit possible) |
| Rejected | weighted approval share **< 0.40** (submitter loses 20 Aura) |
| In between | "inconclusive": stays pending, the next vote re-evaluates it; an admin can settle it |
| Agreeing jurors | +10 XP, +2 Aura |
| Deciding twice | impossible: the submission row is locked and the status is checked |

## Limits on rewards

| Where | Limit |
|---|---|
| `_grant_rewards` | XP 0–5000, Aura 0–500 per call |
| `_deduct_aura` | 1–500, never below 0, logs what was really taken |
| Luck boost | +10 per Daily Discovery, capped at 50 total |
| Private quests | XP 10–200 each, Aura always 0, max 30 active, max 500 XP/day |
| Global quests (`CHECK`) | XP 0–3000, Aura 0–500, duration 1–720 min |
