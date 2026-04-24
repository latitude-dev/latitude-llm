---
name: backoffice
description: Adding, modifying, or guarding staff-only `/backoffice` features — cross-organisation admin tools gated behind `users.role === "admin"`.
---

# Backoffice (staff-only admin area)

**When to use:** Adding, modifying, or guarding staff-only `/backoffice` features — cross-organisation admin tools gated behind `users.role === "admin"`. The backoffice is where platform staff reproduce customer-reported bugs, spot-check data across tenants, and (future) impersonate users for support.

## Absolute security invariant

Non-admin users — authenticated or not — **MUST NOT** be able to access, enumerate, or fingerprint the backoffice surface. Every response is indistinguishable from hitting a random 404. This is enforced by **three independent guards**; every guard is ship-blocking on its own.

## The three guards

### 1. Route loader guard (UI layer)

`apps/web/src/routes/backoffice/route.tsx` asserts `user.role === "admin"` in `beforeLoad` and `loader`, throwing `notFound()` (**not** `redirect` or 403 — those leak the path) on failure. TanStack Start code-splitting means non-admins never fetch the backoffice chunk.

### 2. Server-function guard (RPC layer)

Never call `createServerFn` directly for admin endpoints. **Always go through `createAdminServerFn`** (`apps/web/src/server/admin-server-fn.ts`), which:

- Calls `requireAdminSession()` **before any IO** (throws `NotFoundError`, not 401/403 — the error shape must not fingerprint the admin surface).
- Provides the admin-scoped Postgres client automatically.
- Pipes `withTracing`.

Structurally, a missing guard becomes a type error, not a reviewable omission.

### 3. Database access guard

Admin queries run through `getAdminPostgresClient()` (`apps/web/src/server/clients.ts`), a pool on the separate `LAT_ADMIN_DATABASE_URL` superuser secret. `withPostgres` defaults the organisation scope to `OrganizationId("system")`, which is the only sanctioned signal to skip the RLS `set_config('app.current_organization_id', …)` call (see `packages/platform/db-postgres/src/sql-client.ts`). Admin handlers have **no organisation context** — passing one into `withPostgres` from a backoffice handler is a bug.

## Package layout

```
@domain/admin
  src/
    <feature>/                   # one folder per feature (search, users, ...)
      *-result.ts | entity.ts    # Zod schemas + types
      *-repository.ts            # port (class … extends ServiceMap.Service<…>)
      *.ts                       # use-case(s)
      *.test.ts                  # pure use-case tests with fake ports
      index.ts                   # feature barrel
    index.ts                     # re-exports every feature
```

Keep `@domain/admin` as **one** package with feature folders — do **not** split into `@domain/admin-search`, `@domain/admin-users`, etc. Features share enough scaffolding (policy, audit, RLS-bypass) that splitting causes churn without benefit.

Web-app per-feature split mirrors the package:

```
apps/web/src/domains/admin/
  <feature>.functions.ts         # createAdminServerFn handler(s) + DTOs
  <feature>.functions.test.ts    # input-schema tests
```

Routes live at `apps/web/src/routes/backoffice/<feature>/` (using `route.tsx` / `index.tsx`, **not** `_layout.tsx` — the `_` prefix contributes no URL segment and would collide with `_authenticated/index.tsx` on `/`).

## Adapter discipline

Admin repository adapters (e.g. `AdminSearchRepositoryLive` in `@platform/db-postgres`) run queries **without** an `organization_id` filter. This is only safe because the admin client + `"system"` scope bypasses RLS. Every admin adapter source file carries a header warning explaining the wiring contract — copy that pattern when adding new adapters.

## Error discipline

- `NotFoundError`, **not** `UnauthorizedError`, for every admin guard failure.
- No 401/403/redirect responses anywhere — all refusals look identical to a 404.
- Don't log messages that mention "admin" or "role" at the error path — error shapes/messages fingerprint the surface.

## Roles

- **`users.role`** is the global platform-staff flag (`"user" | "admin"`). DBA-only (Better Auth `additionalFields.role` declares `input: false`).
- **`members.role`** is per-organisation (`"owner" | "admin" | "member"`). **Different concept.** A user who is `members.role = "admin"` of their own org has **zero** backoffice access.

## Tests

- **Use-case tests** (`@domain/admin`): pure functions + fake ports via `Layer.succeed(Port, stubImpl)`. No DB.
- **Adapter tests** (`@platform/db-postgres`): PGlite via `setupTestPostgres()`; drive through `withPostgres(Live, pg.adminPostgresClient)` to match production admin wiring.
- **Guard tests** (`apps/web/src/server/admin-auth.test.ts`): cover admin / user / null / undefined / missing-role, and assert the error shape does not fingerprint the admin surface.
- **Server-function tests**: exercise the exported input schema, not the RPC runtime. The guard is already covered by `admin-auth.test.ts` — don't reassert it per handler.
