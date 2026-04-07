---
name: authentication
description: Sessions, sign-in/sign-up flows, OAuth, magic links, or organization context on the session.
---

# Authentication (Better Auth)

**When to use:** Sessions, sign-in/sign-up flows, OAuth, magic links, or organization context on the session.

## Stack

- **`@platform/db-postgres`** exposes **`createBetterAuth()`** in `packages/platform/db-postgres/src/create-better-auth.ts`, wiring **better-auth** with the Drizzle adapter against the shared Postgres client.
- Sessions: `auth.api.getSession({ headers })` → `{ user, session }` with typed fields.
- **`User`** includes `id`, `email`, `name` — use those fields directly (no assertions).

## Web app helpers

- Session helpers: `apps/web/src/domains/sessions/session.functions.ts` (`getSession`, `ensureSession`, etc.).
- **Organization context** is added via the **`customSession`** plugin (multi-tenant product behavior).

## Domain alignment

- Auth **intent** flows (login/signup completion) use use-cases from **`@domain/auth`** composed with Postgres repositories — keep policy in domain, wiring in apps.

For HTTP boundary rules (who may call what), see [architecture-boundaries](../architecture-boundaries/SKILL.md).
