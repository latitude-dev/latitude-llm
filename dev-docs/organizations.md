# Organizations

Organizations remain the top ownership boundary for reliability.

Billing is also organization-scoped. See `./billing.md` for the full billing model.

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

## Membership and access model (current auth implementation)

- Membership is tracked in Better Auth `members` and linked to `organizations`.
- Browser sessions include `session.activeOrganizationId`; `apps/web` requires this value for authenticated routes.
- Users without an active organization are routed to `/welcome` for organization selection or onboarding.
- `apps/api` and `apps/ingest` do not use browser sessions for auth; they use API-key context directly.

## How organizations get created

Three paths onto the same `organizations` table. Two of them also write the initial `members` row; bootstrap deliberately does not, and stays owner-less until the claim flow adopts it:

1. **Signup / onboarding.** `auth.api.createOrganization` from `/welcome`, membership role hardcoded `"owner"`. The ordinary path.
2. **Bootstrap** (`POST /v1/account/bootstrap`). An owner-less *temporary* org with `expires_at` set, adopted later through the claim flow or reaped. See [`api.md`](./api.md).
3. **Partner provisioning** (`POST /v1/private/partners/:partnerId/accounts`). A signed request from a vetted partner creates the user, the organization, the owner membership, and the partner's OAuth grant in one admin-client transaction. `expires_at` is `null` — these are real accounts from birth, with nothing to claim. See [`partners.md`](./partners.md).

Paths 2 and 3 write memberships directly rather than through Better Auth, so neither fires the `MemberJoined` hook. Path 3 does emit `OrganizationCreated`, matching onboarding.

## How organizations get deleted

Four paths delete an organization row: the settings danger zone (`deleteOrganization` server fn), sandbox deletion (`deleteSandboxUseCase`), account deletion (sole-member orgs, via `deleteUserUseCase`), and the reaper for expired temporary orgs (`organization-cleanup` worker). Members, invitations, and OAuth applications (with their tokens) FK-cascade with the row; API keys and projects have no FK and would outlive it.

Every path therefore runs `teardownOrganizationUseCase` (`@domain/organizations`) scoped to the org: it revokes every API key and every OAuth key, busting their Redis validation caches through `ApiKeyCacheInvalidator` / `OAuthTokenCacheInvalidator`, and purges projects (`ProjectDeleted` cascade). Callers wire `ApiKeyRepositoryLive`, `OAuthKeyRepositoryLive`, `ProjectRepositoryLive`, `OutboxEventWriterLive` plus the two `*CacheInvalidatorLive(redis)` layers. Run it **before** the org delete: OAuth rows are gone once the row cascades and could no longer be listed. Account deletion is the one path that tears down after the delete (the org is removed inside `cleanupUserMembershipsUseCase`); that is safe only because a sole-member org's OAuth tokens are user-bound and cascade with the user, while API keys are revoked post-hoc.

## Tenancy

Organization-scoped reliability data and all domain repositories still follow the existing tenancy model:

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

Organization billing management lives on the authenticated settings route `/settings/billing`, while cross-tenant support and manual enterprise override controls live in backoffice organization detail.
