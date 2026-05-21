# Feature flags

Per-organization runtime switches that gate code paths. Flags are dynamic — operators create and toggle them through `/backoffice/feature-flags/` — but any flag the app **reads** needs a typed constant in `@domain/feature-flags/src/constants.ts` so a typo can't silently disable the gate.

The working example throughout this doc is `SESSION_SEARCH_V2_FLAG = "session-search-v2"`, introduced in PR 4 of LAT-599 to A/B a temporary parallel `/session-search` route against the canonical `/search`. PR 5 of the same stack is the cleanup pass that removes it.

## Shape

| Piece | Where | Notes |
| --- | --- | --- |
| **Identifier** | `kebab-case` string, e.g. `"session-search-v2"` | What lives in the DB row and the backoffice UI. |
| **Constant** | `packages/domain/feature-flags/src/constants.ts` | `SCREAMING_SNAKE_FLAG = "kebab-case" as const`. The `as const` keeps the literal narrow so consumers can use it as a discriminator if useful. |
| **Re-export** | `packages/domain/feature-flags/src/index.ts` | One added line per flag. Without this, app code can't `import { … } from "@domain/feature-flags"`. |
| **DB row** | `feature_flags` (Postgres) + `organization_feature_flags` join table | Created lazily through the backoffice. **No migration is required** when adding a new flag — the catalog page picks the constant up automatically. |

Flags are **scoped to organizations**: enabling a flag for one org doesn't affect any other. Evaluation goes through `FeatureFlagRepository.isEnabledForOrganization(identifier)`, which reads the join table for the org currently bound to the postgres layer.

## Lifecycle

### 1. Declare the constant

`packages/domain/feature-flags/src/constants.ts`:

```ts
/**
 * Gates the temporary `/projects/:projectSlug/session-search` route and
 * sidebar entry while we A/B against the existing trace-flat `/search`
 * route. Remove after PR 5 of LAT-599 cuts `/search` over to the
 * session-rollup implementation.
 */
export const SESSION_SEARCH_V2_FLAG = "session-search-v2" as const
```

JSDoc isn't decorative — describe **what the gate does** when on and off, and **when the flag is expected to be removed**. Future you will read these comments while cleaning up.

### 2. Re-export from the package barrel

`packages/domain/feature-flags/src/index.ts`:

```ts
export {
  CLAUDE_CODE_WRAPPED_FLAG,
  EMAIL_NOTIFICATIONS_FLAG,
  FEATURE_FLAG_IDENTIFIER_MAX_LENGTH,
  FEATURE_FLAG_NAME_MAX_LENGTH,
  SESSION_SEARCH_V2_FLAG,
} from "./constants.ts"
```

If the consumer is reading from `@domain/feature-flags` and the export is missing, the type error you'll see is `has no exported member` — easy to spot in CI, but easier to avoid.

### 3. Gate server behavior

In any Effect that already runs inside `withPostgres(...)`:

```ts
const enabled = yield* FeatureFlagRepository.isEnabledForOrganization(SESSION_SEARCH_V2_FLAG)
if (!enabled) {
  // bail out, fall through to legacy behavior, etc.
}
```

For TanStack-Start server functions outside an Effect, use the wrapper exposed at `apps/web/src/domains/feature-flags/feature-flags.functions.ts`:

```ts
const enabled = await hasFeatureFlag({ data: { identifier: SESSION_SEARCH_V2_FLAG } })
```

The session-search route uses this pattern in its `loader` to redirect to `/search` when the flag is off ([`apps/web/src/routes/_authenticated/projects/$projectSlug/session-search/index.tsx`](../apps/web/src/routes/_authenticated/projects/$projectSlug/session-search/index.tsx)).

### 4. Gate client behavior

Two options, depending on how many places need to know.

**The common case — a single check:**

```ts
import { useHasFeatureFlag } from ".../feature-flags/feature-flags.collection.ts"

const sessionSearchEnabled = useHasFeatureFlag(SESSION_SEARCH_V2_FLAG)
```

`useHasFeatureFlag` returns `boolean`. While the underlying query is loading it returns `false`, so the gated UI flashes "off" briefly — that's the right default for hiding new behavior.

The project sidebar uses this to conditionally render the "Session search" entry ([`apps/web/src/routes/_authenticated/projects/$projectSlug.tsx`](../apps/web/src/routes/_authenticated/projects/$projectSlug.tsx)).

**When you need the raw query:** call `hasFeatureFlag` from a `useQuery` directly, e.g. for `enabled:` chaining of dependent queries. The notifications settings page is the precedent ([`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/account.tsx`](../apps/web/src/routes/_authenticated/projects/$projectSlug/settings/account.tsx)):

```ts
const { data: emailNotificationsEnabled = false } = useQuery({
  queryKey: ["feature-flag", EMAIL_NOTIFICATIONS_FLAG],
  queryFn: () => hasFeatureFlag({ data: { identifier: EMAIL_NOTIFICATIONS_FLAG } }),
})

const { data } = useQuery({
  queryKey: ["notificationPreferences"],
  queryFn: () => getNotificationPreferences(),
  enabled: emailNotificationsEnabled,
})
```

Prefer `useHasFeatureFlag` when both are available — the collection hook reuses a single React-Query entry per org so multiple gates don't fan out to multiple roundtrips.

### 5. Enable for an org

1. Sign in as a staff user (org switcher needs the **Admin** scope).
2. Go to `/backoffice/feature-flags/`.
3. The new constant should already appear in the catalog — click "Create flag" if not.
4. Toggle "Enabled" for the target organization (or globally for staging).

No deploy, no migration — the gate goes live the next time `listEnabledForOrganization` fires (which the client polls via the `featureFlags` query collection).

### 6. Clean up

When the flag has done its job, undo it **in this order** so a half-deployed cleanup never gates production on a constant the code doesn't know about anymore:

1. **Un-wire the checks.** Remove every `useHasFeatureFlag(FLAG)`, `isEnabledForOrganization(FLAG)`, and `hasFeatureFlag({ … FLAG … })` call. Code behind the gate becomes unconditional; legacy code behind the `else` branch gets deleted.
2. **Remove the constant.** Delete it from `constants.ts` and the re-export from `index.ts`. CI is now load-bearing — if anything still imports the constant, this step trips it.
3. **Archive the DB row.** Run `archiveFeatureFlagUseCase` (soft-delete via `archived_at`). The backoffice still surfaces archived flags in its history view but they no longer affect `isEnabledForOrganization`.
4. **(Optional) keep a rollback hatch.** If the cutover is risky enough that you want a fast revert window, leave the constant + row in place for a release cycle and re-wire it as a kill switch instead of removing it. This is the path PR 5 of LAT-599 should evaluate before deleting `SESSION_SEARCH_V2_FLAG`.

The cleanup checklist for `SESSION_SEARCH_V2_FLAG` lives in `specs/session-problems/2-session-level-search.md` under **PR 5 — Cutover + cleanup**.

## Anti-patterns

- **Hardcoded literal at the call site.** `useHasFeatureFlag("session-search-v2")` works at runtime but bypasses the typo guard. Always import the constant.
- **Reading the flag in a hot render path.** `useHasFeatureFlag` is fine (one React-Query subscription per consumer, shared cache), but resolving the same flag inside a deeply-memoized selector can mask unintended re-renders. If you find yourself doing that, lift the boolean to the parent and pass it as a prop.
- **Branching on a flag that no longer has a meaningful "off" path.** Once every org is opted in, the flag is dead — get to step 6 within a release cycle so the codebase doesn't carry dormant gates.
- **Migrations for new flag identifiers.** Don't write one. The catalog row is created lazily through the backoffice, not on deploy.
