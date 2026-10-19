# Decisions and open questions

The task had no one to ask, so these choices were made on your behalf. Each can be reversed.

## Decisions

| Decision | Why |
|---|---|
| Keep migrations 001–020 untouched; add 021–025 | Forward-only history. A live database already ran the old ones. |
| Block ALL client writes to game tables, expose RPC functions | One place enforces the rules; a hacked browser cannot skip them. |
| Identity from `auth.uid()`, never a parameter | A parameter can be forged; the login token cannot. |
| Jury rules: quorum 3, ≥60% weighted approves, <40% rejects, else stays pending | Matches the original intent (documented in `lib/rpg-engine.ts`). Not changed. |
| Jurors need ≥100 Aura | The existing UI already said so; now the database enforces it. |
| Jury queue refreshes by polling, not Realtime | Under the new RLS other players' rows are hidden, so Realtime events no longer arrive. |
| Proof images: private bucket + 5-minute signed links | Public URLs let anyone open anyone's photo. |
| Admin routes use the service-role key, checked against `profiles.role` | The key never reaches the browser; admin cannot be self-granted. |
| `zod` added as a dependency | Allowed by the brief; validates input and strips unknown fields. |
| `server-only` added | Makes the build fail if the service-role module is imported in client code. |
| Next.js 14.2.35, not 16 | Fixes the auth-bypass CVE without a major migration. |
| Simulated discovery and sample plans are labelled as such | Honesty over looking impressive. |
| No licence file added | Choosing MIT/other is the owner's call; README says so. |

## Changes a user can see

- Jury queue updates every few seconds instead of instantly.
- Proof images load via short-lived links (a brief loading state).
- Banned accounts are refused with an error on every action.
- A quest that is completed or pending can no longer be restarted.
- Daily Discovery gives +10 luck/day (cap 50) and says it is a demo analysis.
- The AI plan is labelled when it is sample data; the endpoint requires login and is rate limited.
- Private quests award no Aura (XP only, max 500/day).
- Placeholder PWA icons added; offline/PWA claims removed from docs.

## Known inconsistencies left alone

- `xpForLevel`/`calculateLevel` disagree by one XP at some boundaries (e.g. 406 XP shows level 4). Changing it
  alters a game mechanic, so it is documented in the test instead of "fixed".

## Files that are now redundant

Old migrations 001–020 are still needed to rebuild history. `docs/schema_snapshot.sql` is the readable one-file
view of the current schema; you may delete 001–020 only if you start from the snapshot on a fresh project.
`docs/legacy-sql/*` are the pre-migration SQL dumps, kept for reference and safe to delete.
