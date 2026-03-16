# Settings

Reliability settings are embedded JSONB on the owning entities.

There is no standalone settings domain.

The current settings model is intentionally small and scoped by ownership:

- organization scope owns shared provider credentials and broad defaults
- project scope owns local overrides
- user scope owns personal preferences only

## Owner Tables

- `organization.settings`
- `projects.settings`
- `user.settings`

These payloads are stored directly on the owner row. They are not nested under an extra `reliability` key.

## Canonical Shapes

The settings types should stay close to the original proposal:

```typescript
type ProviderSettings = {
  apiKey: string // persisted using application-level encryption via repository crypto helpers
  ... // provider-specific fields remain extensible; only apiKey is durable today
}

type UserSettings = {
  ... // user-wide settings are still pending precise definition
}

type ProjectSettings = {
  defaultProvider?: string // provider key to use for this project when evaluation settings do not override it
  defaultModel?: string // model to use for this project when evaluation settings do not override it
  keepMonitoring?: boolean // if true, issue-linked evaluations keep running after resolution; if false they are archived
}

type OrganizationSettings = {
  providers: { // map of provider key to reusable execution credentials/settings
    [name: string]: ProviderSettings
  }
  defaultProvider?: string // organization-wide fallback provider key
  defaultModel?: string // organization-wide fallback model for the effective provider
  keepMonitoring?: boolean // organization-wide default for post-resolution monitoring behavior
}
```

## Ownership Semantics

### Organization Settings

`OrganizationSettings` owns the shared execution configuration used across projects.

Field meanings:

- `providers`: the source of configured provider credentials for the organization. The map key is the provider identifier referenced by `defaultProvider`, project overrides, and evaluation-level `settings.provider`.
- `providers[name].apiKey`: the credential used when Latitude executes evaluations through that provider. This is the main secret field in the settings model.
- `defaultProvider`: the organization-wide fallback provider key used when neither the evaluation nor the project selects one explicitly. If it is unset, execution falls back to the first configured provider.
- `defaultModel`: the organization-wide fallback model used when neither the evaluation nor the project selects one explicitly. If it is unset, execution falls back to the first configured model for the effective provider.
- `keepMonitoring`: the organization-wide fallback for what should happen to linked evaluations after a user manually resolves an issue.

Important implications:

- organization scope is the only scope that owns shared provider credentials in the current model
- project and user settings may choose behavior, but they do not introduce their own provider API keys
- if the organization has no configured providers, evaluation execution cannot resolve a shared provider credential through the settings model

### Project Settings

`ProjectSettings` exists so projects can override organization-wide execution behavior without fragmenting credential storage.

Field meanings:

- `defaultProvider`: a project-wide provider override. It selects which organization-configured provider a project should use by default.
- `defaultModel`: a project-wide model override. It chooses the model that project evaluations should use by default.
- `keepMonitoring`: a project-wide override for issue-resolution behavior. It decides the default post-resolution monitor behavior for issues in that project.

Important implications:

- `defaultProvider` does not carry credentials by itself; it points at a provider already configured in `OrganizationSettings.providers`
- `defaultModel` is interpreted relative to the effective provider selected after resolution
- when `ProjectSettings.keepMonitoring` is undefined, the system falls back to `OrganizationSettings.keepMonitoring`

### User Settings

`UserSettings` is intentionally small.

The exact fields are still pending definition, but its role is already clear:

- it is reserved for personal workflow or UX preferences
- it must not store provider credentials
- it must not change shared execution behavior for a whole project or organization
- it must not override provider/model resolution used for evaluation execution

This keeps shared operational behavior independent from which human user is signed in.

## Field Resolution

### Provider And Model Resolution

When evaluation execution needs provider/model configuration, resolution flows from the most specific scope to the broadest one:

1. evaluation settings
2. project settings
3. organization settings

This means:

- evaluation-level settings are the narrowest override layer
- project settings supply the normal per-project default behavior
- organization settings supply the shared fallback behavior
- user settings never override execution credentials or execution provider/model selection

The provider is resolved first, then the model is resolved for that effective provider.

If organization-level defaults are unset:

- the provider falls back to the first configured provider
- the model falls back to the first configured model for that effective provider

### `keepMonitoring`

`keepMonitoring` is the exact field name that controls what happens to issue-linked evaluations when an issue resolves.

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

## Secret Storage

Provider credentials must use application-level encryption before persistence.

The spec intentionally does not force a new JSON envelope format. It only requires that the repository crypto helpers are used so the application encrypts API keys before storing them and never persists plaintext keys.

In practice:

- the logical settings shape still contains an `apiKey` field
- that field must never be stored as plaintext by the application
- settings behavior should be documented in terms of the logical field, not a storage-envelope implementation detail

## Indexing

No new secondary indexes are required on `organization.settings`, `projects.settings`, or `user.settings` in the settings foundation phase.

Those payloads are read through the owner-row primary/unique lookup paths, so speculative JSONB/GiN indexes would be premature.

## UI Placement

- organization settings are accessible from the home dashboard
- project settings are accessible from the project dashboard
- user settings are accessible from the profile menu
