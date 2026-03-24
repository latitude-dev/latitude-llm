# Settings

Reliability settings stay attached to owner entities. There is no standalone settings domain.

The settings model is intentionally phased:

- MVP only needs organization/project `keepMonitoring`
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

## UI Placement

MVP entry points:

- organization settings are accessible from the home dashboard
- project settings are accessible from the project dashboard

Post-MVP:

- user settings belong in the profile menu only if user-scoped settings actually gain concrete product value
