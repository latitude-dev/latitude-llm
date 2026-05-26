# Feature flags

Per-organization runtime switches that gate code paths. The **catalog** lives in code as a typed registry; the **enablement state** (which orgs see the flag turned on) lives in the DB and is managed through `/backoffice/feature-flags/`. Calling code references each flag with a raw string literal — the parameter type `FeatureFlagId` is a literal union derived from the registry, so an unknown flag fails to compile.

## Shape

| Piece | Where | Notes |
| --- | --- | --- |
| **Registry** | `packages/domain/feature-flags/src/registry.ts` | `FEATURE_FLAGS` map of `identifier → { emoji, name, description }`. `FeatureFlagId = keyof typeof FEATURE_FLAGS`. |
| **Identifier** | `kebab-case` string, e.g. `"slack"` | Used at call sites and as the DB key. |
| **DB rows** | `feature_flags` + `organization_feature_flags` | Both keyed by `identifier`. `feature_flags` stores `enabled_for_all`; `organization_feature_flags` records per-org opt-ins. Missing rows mean disabled. |

The DB never needs to know about a flag in advance — it only gains rows when someone toggles the flag in the backoffice. Identifiers that exist in the DB but no longer in the registry are inert at runtime and can be cleaned up later.

## Lifecycle

### 1. Add the flag to the registry

`packages/domain/feature-flags/src/registry.ts`:

```ts
export const FEATURE_FLAGS = {
  // …existing flags…
  "new-dashboard": {
    emoji: "📊",
    name: "New dashboard",
    description: "Enables the rebuilt dashboard with the v2 layout.",
  },
} as const satisfies Record<string, { readonly emoji: string; readonly name: string; readonly description: string }>
```

`emoji` renders as the row's leading icon in the backoffice (both the flag list and the per-org section), `name` is the row title, and `description` is the subtitle. All three are required by the `satisfies` clause.

### 2. Gate server behaviour

In any Effect that already runs inside `withPostgres(...)`:

```ts
const enabled = yield* FeatureFlagRepository.isEnabledForOrganization("new-dashboard")
if (!enabled) {
  // bail out, fall through to legacy behaviour, etc.
}
```

For TanStack-Start server functions outside an Effect, use the wrapper at `apps/web/src/domains/feature-flags/feature-flags.functions.ts`:

```ts
const enabled = await hasFeatureFlag({ data: { identifier: "new-dashboard" } })
```

The input schema is `featureFlagIdentifierSchema`, so an unknown literal is rejected at parse time as well as at type-check time.

### 3. Gate client behaviour

The common case is a single boolean:

```ts
import { useHasFeatureFlag } from ".../feature-flags/feature-flags.collection.ts"

const dashboardEnabled = useHasFeatureFlag("new-dashboard")
```

`useHasFeatureFlag` returns `boolean`. While the underlying query is loading it returns `false`, so the gated UI flashes "off" briefly — that's the right default for hiding new behaviour.

When you need the raw query (e.g. for `enabled:` chaining of dependent queries), use `hasFeatureFlag` inside a `useQuery` directly — the notifications settings page is the precedent (`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/account.tsx`).

### 4. Enable for an org or globally

1. Sign in as a staff user (the org switcher needs the **Admin** scope).
2. Go to `/backoffice/feature-flags/`.
3. Every flag in the registry appears in the list automatically.
4. Either toggle the per-org enablement on the org's backoffice page, or use the row's "Enable globally" action to upsert the catalog row with `enabled_for_all = true`.

No deploy, no migration — the gate goes live the next time `listEnabledForOrganization` fires (which the client polls via the `featureFlags` query collection).

### 5. Clean up

When the flag has done its job:

1. **Un-wire the checks.** Remove every `useHasFeatureFlag("...")`, `isEnabledForOrganization("...")`, and `hasFeatureFlag({ … "..." … })` call. Code behind the gate becomes unconditional; the `else` branch is deleted.
2. **Remove the registry entry.** Delete the key from `FEATURE_FLAGS`. CI is now load-bearing — anything that still references the literal stops compiling.
3. **(Optional) tidy up the DB.** Existing rows for the removed identifier are inert. If you care about housekeeping, delete them directly in Postgres — there's no migration; the catalog isn't tracked there.

## Eligibility queries for cross-org workers

Workers that fan out work across orgs use the admin port's `findEligibilityForFlag`:

```ts
const eligibility = yield* adminFlags.findEligibilityForFlag("claude-code-wrapped")
if (eligibility.enabledForAll) {
  // Every org is in.
} else {
  for (const orgId of eligibility.organizationIds) {
    // Schedule per eligible org.
  }
}
```

If the flag has no DB row, eligibility comes back as `{ enabledForAll: false, organizationIds: [] }`.

## Anti-patterns

- **Reading the flag in a hot render path.** `useHasFeatureFlag` is fine (one React-Query subscription per consumer, shared cache), but resolving the same flag inside a deeply-memoized selector can mask unintended re-renders. If you find yourself doing that, lift the boolean to the parent and pass it as a prop.
- **Branching on a flag that no longer has a meaningful "off" path.** Once every org is opted in, the flag is dead — get to step 5 within a release cycle so the codebase doesn't carry dormant gates.
