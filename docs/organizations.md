# Organizations

Organizations remain the top ownership boundary for reliability.

## Reliability Additions

Organizations gain organization-scoped reliability settings.

In MVP, `organization.settings` only needs:

- `keepMonitoring`

Post-MVP, the same organization scope is also the home of shared execution configuration:

- shared provider credentials
- organization-wide default provider/model
- broader reliability defaults that apply across projects

The exact storage shape of post-MVP provider credentials is intentionally still pending. The design phase immediately before implementation must decide whether `providers` stays embedded in `organization.settings` or moves into a dedicated organization-scoped table.

## Why Organization Scope Matters

Organization scope is where reliability needs:

- shared issue/evaluation ownership
- cross-project defaults
- post-MVP shared execution credentials

## Tenancy

Reliability entities remain organization-scoped through the existing tenancy model:

- `evaluations`
- `issues`
- `annotation_queues`
- `simulations`

ClickHouse score storage and rollups also stay organization-first in their sort-key/query patterns.

## Access Control

Important repository-specific note:

- `organization` itself does not use the standard `organizationRLSPolicy`
- access to `organization.settings` is enforced through auth/membership checks at the application boundary
- if provider credentials later move into a dedicated organization-scoped table, that storage must follow the same boundary-level auth/membership enforcement

## Product Surface

Organization-wide reliability settings belong in:

- the home dashboard UI
- matching public API contracts
- post-MVP provider credential/default provider-model management alongside the same organization-scoped settings surface
