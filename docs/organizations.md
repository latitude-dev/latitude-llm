# Organizations

Organizations remain the top ownership boundary for reliability.

## Reliability Additions

Organizations gain a `settings` JSONB payload that owns:

- shared provider credentials
- organization-wide default provider/model
- broader reliability defaults that apply across projects
- `keepMonitoring`

## Why Organization Scope Matters

Organization scope is where reliability needs:

- shared execution credentials
- shared issue/evaluation ownership
- cross-project defaults

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

## Product Surface

Organization-wide reliability settings belong in:

- the home dashboard UI
- matching public API contracts
