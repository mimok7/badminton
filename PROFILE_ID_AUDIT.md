# Profile Identity Audit

`profiles.id` and `profiles.user_id` are not redundant in the current system.

Current roles:

- `profiles.id`
  Used as the app-level player/profile identifier.
  Referenced by generated match player slots such as `generated_matches.team1_player1_id`.
  Also used by some attendance and participant flows after old migrations.

- `profiles.user_id`
  Used as the link to `auth.users.id`.
  This is the value returned by `auth.uid()` and used by login/session/RLS checks.

Why `profiles.user_id` cannot be safely deleted now:

- RLS/admin checks still rely on matching the logged-in auth user to a profile row.
- Several tables and migrations still distinguish between auth user ids and profile ids.
- Generated match features store `profiles.id`, not `auth.users.id`, for player assignment.
- There are existing migration files that explicitly moved some relations from `auth.users.id` to `profiles.id`.

Representative usage in this repo:

- Auth/profile lookup: `src/lib/auth.ts`
- Generated match player references: `src/app/(user)/my-schedule/page.tsx`, `src/app/api/admin/match-sessions/route.ts`
- Participant/profile-id migration history: `sql/fix_participant_user_ids.sql`
- Schema references to `profiles.id`: `sql/restore_schema_structure_only.sql`, `sql/create_match_player_status.sql`

Safe conclusion:

- Do not delete `profiles.user_id` yet.
- First choose one identity model for the whole app:
  - Option A: auth-first, use `auth.users.id` everywhere for user ownership and keep `profiles.id` only as a surrogate row id.
  - Option B: profile-first, use `profiles.id` everywhere in app tables and keep `profiles.user_id` only as the login bridge.
- After that, migrate all foreign keys, RLS, joins, and client queries consistently in one controlled migration.

Chosen direction for this repo:

- Use `profiles.id` as the canonical app/player id.
- Use `profiles.user_id` only as the bridge to the authenticated Supabase user.
- Treat `user_id IS NULL` profiles as signup placeholders, not automatically as broken rows.

Current invariant:

- Every authenticated `auth.users` account must map to exactly one `profiles.user_id`.
- App tables such as `match_participants.user_id`, `attendances.user_id`, and generated match player slots should store `profiles.id`.
- Signup should attach an auth user to an existing placeholder profile instead of creating a duplicate profile row.

Current data note:

- As of the latest audit, all authenticated users are linked to a profile.
- Remaining `profiles.user_id IS NULL` rows are unclaimed placeholder members reserved for future signup.
- These placeholder rows should be audited separately from true identity conflicts.
