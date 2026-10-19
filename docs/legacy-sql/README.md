# Legacy SQL — do not run

These three files are **old, overlapping attempts at a schema**. They were the
repo's schema before the numbered migrations in `supabase/migrations/` became
the single source of truth. They are kept here only for history.

| File | Why it must not be used |
|---|---|
| `schema.sql` | A different, incompatible design (enums, other column names). The app does not match it. |
| `sprint2-migration.sql` | Extends `schema.sql`, not the real schema. |
| `FULL_RESET.sql` | A copy of migrations 001–018 from an old point in time. It also contains the **insecure** policies and functions that migrations 021–025 remove. Running it would re-open every hole. |

They can be deleted. Nothing in the app, the tests or CI refers to them.
The reference for the current database is `docs/SCHEMA_SNAPSHOT.md`.
