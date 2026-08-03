# Settings

Reliability settings stay attached to owner entities. There is no standalone settings domain.

Billing is the main exception for product surface placement: the settings area includes `/settings/billing`, but the billing rules and runtime enforcement model are documented separately in `./billing.md`. Billing now also owns one organization-scoped settings field, `organization.settings.billing.spendingLimitCents`, for optional Pro spend caps.

The settings model is intentionally phased:

- MVP starts with organization/project `keepMonitoring`
- billing adds `organization.settings.billing.spendingLimitCents` for customer-managed Pro spend caps
- user-configurable provider/model execution is deferred to a post-MVP phase
- user-scoped settings remain deferred until a concrete user preference exists

## Owner Tables

MVP owner settings live on:

- `organization.settings`
- `projects.settings`

Post-MVP extensions may add:

- `user.settings`
- `evaluations.settings`
- organization-scoped provider credential storage, either inside `organization.settings` or in a dedicated table if the later design phase chooses that shape

These payloads are stored directly on the owner row when they exist. They are not nested under an extra `reliability` key.

## MVP Owner Settings

```typescript
type ProjectSettings = {
  keepMonitoring?: boolean // if true, issue-linked evaluations keep running after resolution; if false they are archived
}

type OrganizationSettings = {
  keepMonitoring?: boolean // organization-wide default for post-resolution monitoring behavior
  billing?: {
    spendingLimitCents?: number // optional Pro-only spend cap including base subscription and metered overage
  }
}
```

`keepMonitoring` is the exact field controlling what happens to issue-linked evaluations when an issue resolves.

Resolution rules:

- `ProjectSettings.keepMonitoring` wins when it is defined
- otherwise the system falls back to `OrganizationSettings.keepMonitoring`
- when a user manually resolves an issue, this resolved value becomes the default state of the confirmation-modal toggle
- the user may still override that toggle for the specific resolve action

Meaning of the values:

- `true`: keep linked evaluations active so they can detect regressions after resolution
- `false`: archive linked evaluations when the issue resolves

Manual ignore behavior is separate:

- ignoring an issue always archives linked evaluations immediately
- `keepMonitoring` does not affect the manual ignore path

Project flagger configuration does not live in `projects.settings`. It lives in the project-scoped `flaggers` table so users can enable or disable each provisioned flagger independently and inspect what each flagger does.

The billing field is intentionally narrow:

- it is organization-scoped, not project-scoped
- it is used only for effective `pro` plans
- it stores the cap in integer cents so the billing domain can enforce it without float rounding drift
- it configures billing behavior but does not replace the application-owned billing tables that track usage periods, overage, or manual overrides

## Post-MVP Execution Settings

The original provider/model plan is intentionally deferred, not discarded.

When that phase returns, the settings shapes should stay close to the original proposal:

```typescript
type UserSettings = {
  ... // user-wide settings are still pending precise definition
}

type ProviderSettings = {
  apiKey: string // persisted using application-level encryption via repository crypto helpers
  ... // provider-specific fields remain extensible
}

type ProjectSettings = {
  keepMonitoring?: boolean // retained from MVP
  defaultProvider?: string // provider key to use for this project when evaluation settings do not override it
  defaultModel?: string // model to use for this project when evaluation settings do not override it
}

type OrganizationSettings = {
  keepMonitoring?: boolean // retained from MVP
  providers: Record<string, ProviderSettings> // provider name to provider settings
  defaultProvider?: string // organization-wide fallback provider key
  defaultModel?: string // organization-wide fallback model for the effective provider
}

type EvaluationSettings = {
  provider?: string // if not provided, resolution falls back through project settings and then organization settings
  model?: string // if not provided, resolution falls back through project settings and then organization settings
}
```

Design note:

- immediately before implementation, define whether `OrganizationSettings.providers` stays embedded in `organization.settings` JSONB or moves to a dedicated organization-scoped table
- if that design phase concludes that `user.settings` still has no concrete product value, do not add it just to mirror the other scopes

## Ownership Semantics

### Organization Settings

Organization scope owns the broadest reliability defaults.

In MVP, that means:

- `keepMonitoring`
- `billing.spendingLimitCents` for optional Pro spend caps

Post-MVP, it is also the home of shared provider execution configuration:

- `providers`: the source of configured provider credentials for the organization
- `providers[name].apiKey`: the credential used when Latitude executes evaluations through that provider
- `defaultProvider`: the organization-wide fallback provider key
- `defaultModel`: the organization-wide fallback model for the effective provider

Important implications:

- organization scope is the only scope that should own shared provider credentials
- project/evaluation settings may choose behavior, but they should not duplicate organization-owned secrets
- the exact storage shape of `providers` is intentionally pending design immediately before the post-MVP implementation phase

### Project Settings

Project scope owns project-level reliability defaults.

In MVP, that means:

- `keepMonitoring`

Post-MVP, projects may also override shared execution defaults without fragmenting credential storage:

- `defaultProvider`
- `defaultModel`

Important implications:

- `defaultProvider` points at an organization-configured provider; it does not carry credentials by itself
- `defaultModel` is interpreted relative to the effective provider selected after resolution

### Evaluation Settings

Evaluation-level execution settings are post-MVP only.

If they land, their role is intentionally narrow:

- they may override provider/model selection for one evaluation
- they should not become a broad miscellaneous settings bag
- they should not store credentials

### User Settings

`UserSettings` remains intentionally small and deferred.

Its role, when concrete fields are approved, is:

- personal workflow or UX preferences
- never shared provider credentials
- never project-wide or organization-wide execution behavior

## Field Resolution

### `keepMonitoring`

`keepMonitoring` resolves from the most specific owner scope to the broadest one:

1. project settings
2. organization settings

### `redaction`

PII redaction resolves through a **parallel** function, `resolveRedactionPolicy`, not through `resolveSettingsCascade`. That helper resolves a single boolean consumed elsewhere; keeping redaction separate holds the blast radius at zero.

Resolution is not a plain narrowest-wins cascade, because the organization layer can seize it:

1. if `organization.redaction.locked === true`, the organization policy is used **outright** and the project policy is ignored entirely, not merged
2. otherwise resolve field by field: project value, else organization value, else system default
3. system defaults are `mode: "off"`, the default entity set, metadata scope off, identities kept

`locked` is all-or-nothing rather than per-field on purpose. Partial locking produces an effective policy no UI can explain, and the enterprise requirement it exists for is "projects cannot weaken this", which all-or-nothing already satisfies.

The resolved policy carries a `source` of `organization`, `project`, or `default` so the settings UI can say where a value came from. The engine never sees it: `RedactionPolicy` is a narrower type without `source` or `mode`, because a policy exists only for a project that redacts — presence *is* the decision, which is why the queue wire format has no mode field.

**Where each half is read.** Project settings are already loaded per ingest batch for sampling, so the project half is free. The organization half needs its own read and goes through a 60 s Redis cache (`org:${organizationId}:settings:redaction`); the web write invalidates it, so the TTL is a backstop rather than the expected propagation delay. A cache failure degrades to a database read, and a database failure propagates — degrading to "no organization policy" would let a `locked` policy fall through to a weaker project one and write plaintext.

**Authorization** lives in the web server functions rather than the use cases: project-level needs `admin` or `owner`, organization-level needs `owner`. `@domain/projects` cannot reach `MembershipRepository` without a dependency cycle, so gating one side in the domain would leave the two asymmetric. Every change emits an audit-only outbox event carrying before and after snapshots.

**Writes must patch, never replace.** `settingsPatch` on the update use cases merges against the freshly-read row inside the transaction; `settings` still replaces, because `updateSpendingLimitUseCase` clears a key by rebuilding settings without it. Any writer that replaces silently drops the keys it does not know about, which for redaction means turning a compliance control off with no error.

### Provider And Model Resolution

For MVP and early hosted execution, evaluation `llm()` calls do not resolve provider/model from stored settings. They run through `@platform/ai-vercel` and the Vercel AI SDK with Latitude-managed provider/model/API-key configuration.

Post-MVP, once runtime-configured execution lands, provider/model resolution should flow:

1. evaluation settings
2. project settings
3. organization settings

This means:

- evaluation settings are the narrowest override layer
- project settings supply the normal per-project default behavior
- organization settings supply the shared fallback behavior
- user settings never override execution credentials or execution provider/model selection

The provider resolves first, then the model resolves for that effective provider.

## Secret Storage

Provider credentials become relevant only when the post-MVP execution-settings phase lands.

At that point:

- provider credentials must use application-level encryption before persistence
- the spec does not force a new JSON envelope format
- the repository crypto helpers must be used so the application never persists plaintext API keys
- settings behavior should still be documented in terms of the logical `apiKey` field, not a storage-envelope implementation detail

## Indexing

No new secondary indexes are required on `organization.settings` or `projects.settings` in the MVP settings phase.

Those payloads are read through the owner-row primary/unique lookup paths, so speculative JSONB/GiN indexes would be premature.

The later provider-settings design phase should justify any dedicated-table indexes explicitly instead of carrying forward speculative JSONB indexing.

## Scoped settings and organization defaults

Several product settings exist at both organization and project scope. Each uses the same resolution rule: a project override inherits per field (`NULL` → inherit from the organization default, non-null → **replace wholesale**, no deep merge). The organization default is always the row or JSON object stored with no project id (`project_id IS NULL` for table-backed configs, or fields on `organization.settings` for JSONB-backed ones).

The settings UI surfaces this through `ScopedSetting` (`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/-components/scoped-setting.tsx`). Every dual-scoped card shows a **Set by** control in the header:

- **Organization** — the value comes from the org default; the project has no override stored.
- **This project** — the project stores an override. Switching back to Organization clears the override (after confirmation when the change affects other projects).

`fixed` scope chips are used when a setting only exists at one layer (for example billing spend caps are organization-only). `selectable` scope is the override/reset action: flipping the selector stages a pending change with an explicit Apply/Discard bar so comparing layers costs nothing until the user commits.

Organization-wide edits that can affect every project use an interrupting confirmation (`org-default-confirm.tsx`) that states the blast radius — how many other projects currently override the field.

### Organization defaults page

`settings/defaults` is the fleet view: one page per organization (reachable from project settings) that lists every dual-scoped default, how many projects deviate, and entry points to edit the organization value. It is the only settings surface where scope is the page subject rather than a per-card property. Organization-default modals for redaction, agent dispatch, and GitHub live here; project settings pages reuse the same `ScopedSetting` cards for per-project overrides.

### Dual-scoped settings today

| Setting | Storage | Org default | Project override | Notes |
| --- | --- | --- | --- | --- |
| PII redaction | `organization.settings.redaction` / `projects.settings.redaction` | `organizationRedactionSettingSchema` with optional `locked` | `redactionSettingSchema` | `locked` makes the org policy authoritative — project redaction is ignored entirely, not merged. See [redaction resolution](#redaction). |
| Agent dispatch | `agent_dispatch_configs` (`project_id IS NULL` vs per-project row) | One row per connected integration | Per-integration override row | Connecting an integration seeds the org default so every project inherits the target. See [`agent-dispatch.md`](./agent-dispatch.md). |
| GitHub monitor | `github_sync_configs` | Same cascade as agent dispatch | Per-project repo/branch + monitor settings | See [`github-integration.md`](./github-integration.md). |
| Slack notifications | Integration config tables | Org-level connection | Per-project channel overrides | Uses the same `ScopedSetting` pattern on the Slack integration settings page. |

Redaction is the exception to plain cascade semantics: when `organization.redaction.locked === true`, the organization policy wins outright and project fields are not read.

Override detection for redaction uses `hasRedactionField` from `@domain/shared` — a project counts as overriding when any redaction field is set, matching what `resolveRedactionPolicy` considers a project source.

## UI Placement

MVP entry points:

- organization settings are accessible from the home dashboard
- project settings are accessible from the project dashboard
- organization defaults (`settings/defaults`) list org-wide values and deviation counts for dual-scoped settings

Post-MVP:

- user settings belong in the profile menu only if user-scoped settings actually gain concrete product value
