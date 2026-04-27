# Users

User identity in web auth flows comes from Better Auth `users` and is surfaced to boundaries through `getSession().user`.

User-level reliability settings are intentionally small.

Reliability execution credentials and shared monitoring behavior belong to organizations and projects, not to individual users.

## Reliability additions

For API-key-based calls, `apps/api` and `apps/ingest` derive user context as `api-key:{keyId}`, with organization authorization handled separately from session state.

Users gain a `settings` JSONB payload for personal workflow preferences only.

The exact fields are still pending definition in the proposal.

## Why User Scope Stays Small

Keeping reliability user settings small avoids:

1. credential fragmentation
2. shared operational behavior depending on who is signed in

User scope should shape personal UX, not shared operational policy.
