# Settings

Settings are embedded JSONB on the owning entities.

There is no standalone settings domain.

The current settings model is intentionally small and scoped by ownership:

- organization scope owns broad defaults
- project scope owns local overrides

## Owner Tables

- `organization.settings`
- `projects.settings`

These payloads are stored directly on the owner row through `settings` columns added to the existing owner tables.

## Canonical Shapes

```typescript
type OrganizationSettings = {
  keepMonitoring?: boolean
}

type ProjectSettings = {
  keepMonitoring?: boolean
}
```

All fields are optional. Missing means "not set at this level" — resolution falls through to the next scope.

## Ownership Semantics

### Organization Settings

`OrganizationSettings` owns the shared configuration used across projects.

Field meanings:

- `keepMonitoring`: the organization-wide fallback for what should happen to linked evaluations after a user manually resolves an issue.

### Project Settings

`ProjectSettings` exists so projects can override organization-wide behavior.

Field meanings:

- `keepMonitoring`: a project-wide override for issue-resolution behavior. It decides the default post-resolution monitor behavior for issues in that project.

Important implications:

- when `ProjectSettings.keepMonitoring` is undefined, the system falls back to `OrganizationSettings.keepMonitoring`

## Field Resolution

### `keepMonitoring`

`keepMonitoring` is the exact field name that controls what happens to issue-linked evaluations when an issue resolves.

Resolution chain (most specific wins):

1. **Project-level** `ProjectSettings.keepMonitoring` — wins when defined
2. **Organization-level** `OrganizationSettings.keepMonitoring` — fallback
3. **System default** `true` — safest default to avoid accidentally losing monitoring coverage

> Future: evaluation-level settings will be the narrowest override layer, inserted before project in the chain.

When a user manually resolves an issue, this resolved value becomes the default state of the confirmation-modal toggle. The user may still override that toggle for the specific resolve action.

Meaning of the values:

- `true`: keep linked evaluations active so they can detect regressions after resolution
- `false`: archive linked evaluations when the issue resolves

Manual ignore behavior is separate:

- ignoring an issue always archives linked evaluations immediately
- `keepMonitoring` does not affect the manual ignore path

## Indexing

No new secondary indexes are required on `organization.settings` or `projects.settings` in the settings foundation phase.

Those payloads are read through the owner-row primary/unique lookup paths, so speculative JSONB/GIN indexes would be premature.

## UI Placement

- organization settings are accessible from the home dashboard
- project settings are accessible from the project dashboard
