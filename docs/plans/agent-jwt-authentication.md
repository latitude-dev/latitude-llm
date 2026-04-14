# Agent JWT Authentication For AI Agents

> **Documentation**: `docs/authentication.md`

## Goal

Implement Better Auth-based JWT authentication for AI agents in `apps/api` while preserving the existing API key path.

The solution must support two operating modes:

- regular mode, where the user is on the host machine and can approve in a browser
- headless mode, where the agent runs remotely and the user completes approval separately in a browser on the host

## Chosen Approach

- Use `@better-auth/agent-auth` as the primary agent authentication mechanism.
- Keep Better Auth's interactive provider and approval UI in `apps/web`.
- Verify agent JWTs inside `apps/api` using the shared Better Auth configuration from `packages/platform/db-postgres`.
- Keep the current organization-scoped API key authentication in `apps/api` unchanged and additive.
- Expose the whole protected `apps/api` surface as agent capabilities.
- Start with `device_authorization` for approval flows in v1.
- Keep default auto-grants conservative, especially for mutating routes.

## Constraints And Invariants

- `apps/api` remains the stable public API boundary.
- `apps/web` remains the browser-facing Better Auth boundary.
- Agent JWT auth must not break current API key consumers.
- Organization access must still be enforced at the API boundary before domain execution.
- Capability names must be stable and explicit, not inferred from unstable generated route names.
- Mutating operations must not be auto-granted by default.
- The upstream Better Auth `agent-auth` plugin is unstable, so rollout should be feature-flagged.

## Design Summary

### Auth modes

- **API key**: current path for existing machine integrations.
- **Agent JWT**: Better Auth-issued, short-lived, capability-scoped bearer token for AI agents.

### Boundary ownership

- `packages/platform/db-postgres`: shared Better Auth configuration and Better Auth schema.
- `apps/web`: Better Auth route mounting, discovery, agent approval UI, device authorization UX.
- `apps/api`: request authentication, agent JWT verification, capability enforcement, org membership enforcement.

### Capability model

- Every protected `apps/api` route gets an explicit `operationId`.
- `operationId` values become stable capability identifiers.
- Capability grants are checked in `apps/api` for agent JWT requests.
- API key requests continue using the existing auth path and do not participate in capability grant checks.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Shared Better Auth Agent Foundation

- [ ] **P1-1**: Add `@better-auth/agent-auth` to `packages/platform/db-postgres` dependencies.
- [ ] **P1-2**: Extend `packages/platform/db-postgres/src/create-better-auth.ts` to register `agentAuth(...)`.
- [ ] **P1-3**: Configure `modes: ["delegated", "autonomous"]`.
- [ ] **P1-4**: Configure `approvalMethods: ["device_authorization"]` for v1.
- [ ] **P1-5**: Configure `requireAuthForCapabilities: true`.
- [ ] **P1-6**: Configure conservative `defaultHostCapabilities`, ideally read-only by default.
- [ ] **P1-7**: Add `onEvent` hooks for audit logging of registration, grants, approvals, and execution.
- [ ] **P1-8**: Mirror the plugin configuration in `packages/platform/db-postgres/auth.cli.ts` so Better Auth schema generation stays aligned with runtime.
- [ ] **P1-9**: Generate and port the new Better Auth schema into `packages/platform/db-postgres/src/schema/better-auth.ts`.
- [ ] **P1-10**: Add the required Postgres migration files for the agent-auth tables.

**Exit gate**:

- Shared Better Auth config includes `agent-auth`.
- CLI schema generation and handwritten schema are aligned.
- Database migrations exist for all new Better Auth tables.

### Phase 2 - Stable Capability Definitions For `apps/api`

- [ ] **P2-1**: Add explicit `operationId` to every protected route in `apps/api/src/routes/*`.
- [ ] **P2-2**: Introduce stable capability naming conventions for all protected API operations.
- [ ] **P2-3**: Create a shared capability registry module in `apps/api` so route definitions and runtime checks use the same identifiers.
- [ ] **P2-4**: Exclude health and other public routes from the capability set.
- [ ] **P2-5**: Confirm the generated OpenAPI spec exposes stable capability identifiers for the full protected API surface.

**Exit gate**:

- Every protected API route has a stable, explicit capability identifier.
- The full protected API surface can be mapped to capabilities without relying on generated names.

### Phase 3 - Provider Surface And Approval UX In `apps/web`

- [ ] **P3-1**: Keep Better Auth mounted under `apps/web/src/routes/api/auth/$.ts`.
- [ ] **P3-2**: Expose `/.well-known/agent-configuration` from the web app root.
- [ ] **P3-3**: Add the device authorization verification and approval pages required for browser-based approval.
- [ ] **P3-4**: Reuse the existing Better Auth browser session to authorize approvals.
- [ ] **P3-5**: If needed, add the Better Auth client-side agent auth plugin for typed UI interactions.
- [ ] **P3-6**: Make the UX work both when the browser is auto-opened locally and when a remote agent only prints a code and URL.

**Exit gate**:

- Agents can discover the provider.
- Users can complete device-based approval flows from the browser.
- The approval flow works for both local and remote/headless agent usage.

### Phase 4 - Agent JWT Verification In `apps/api`

- [ ] **P4-1**: Add a Better Auth instance in `apps/api` for verification-only usage, backed by the shared config and admin Postgres client.
- [ ] **P4-2**: Extend `apps/api/src/middleware/auth.ts` to try Better Auth agent-session verification before falling back to API key validation.
- [ ] **P4-3**: Extend `apps/api/src/types.ts` so auth context supports both `api-key` and `agent-jwt` principals.
- [ ] **P4-4**: Separate principal identity from final organization scope so org checks are not coupled to API key assumptions.
- [ ] **P4-5**: Update `apps/api/src/middleware/organization-context.ts` so agent JWT requests must still prove membership in the requested organization.
- [ ] **P4-6**: Preserve current API key behavior exactly for existing callers.

**Exit gate**:

- `apps/api` accepts valid agent JWT bearer tokens.
- `apps/api` still accepts existing API keys.
- Organization access remains enforced at the boundary for both auth modes.

### Phase 5 - Capability Enforcement On Real API Routes

- [ ] **P5-1**: Add shared capability enforcement helpers in `apps/api`.
- [ ] **P5-2**: Map each protected route to the matching capability identifier.
- [ ] **P5-3**: Enforce active grant presence for agent JWT requests.
- [ ] **P5-4**: Enforce grant constraints for custom capability locations where Better Auth `onExecute` does not run.
- [ ] **P5-5**: Skip capability grant checks for API key requests.
- [ ] **P5-6**: Update OpenAPI security descriptions to document that bearer auth may be either an API key or an agent JWT.

**Exit gate**:

- Agent JWT callers can only invoke granted capabilities.
- API key callers keep current behavior.
- Protected route enforcement is centralized enough to avoid drift.

### Phase 6 - Tests

- [ ] **P6-1**: Extend `apps/api` test setup to support Better Auth-backed agent JWT flows.
- [ ] **P6-2**: Add integration tests for valid agent JWT access on read routes.
- [ ] **P6-3**: Add integration tests for valid agent JWT access on write routes after approval and grant.
- [ ] **P6-4**: Add integration tests for invalid, expired, or audience-mismatched JWTs returning `401`.
- [ ] **P6-5**: Add integration tests for missing grants or org mismatches returning `403`.
- [ ] **P6-6**: Re-run and preserve all existing API key auth tests.
- [ ] **P6-7**: Add discovery-route and device-approval UI tests in `apps/web`.

**Exit gate**:

- Both auth paths are covered by integration tests.
- Negative-path tests cover capability, org, expiry, and audience failures.
- Existing API key coverage remains green.

### Phase 7 - Docs, Env, And Rollout

- [ ] **P7-1**: Add a feature flag such as `LAT_AGENT_AUTH_ENABLED`.
- [ ] **P7-2**: Update `.env.example` with any new auth-related configuration.
- [ ] **P7-3**: Update `docs/authentication.md` to document the combined API key and agent JWT auth model.
- [ ] **P7-4**: Document the delegated approval flow and the headless/remote flow.
- [ ] **P7-5**: Document the rollout constraint that Better Auth `agent-auth` is upstream-unstable and should remain gated.

**Exit gate**:

- Feature-flagged rollout is possible.
- Auth documentation matches the intended architecture.
- Operators know how to enable, test, and reason about the new flow.

## Recommended V1 Decisions

- Use `device_authorization` only.
- Keep default auto-grants read-only.
- Preserve API keys as a parallel auth mechanism.
- Feature-flag the entire agent-auth path.
- Defer CIBA and MCP-specific surfaces until the core agent JWT path is stable.

## Acceptance Criteria

- A remote agent can initiate auth, print a code or verification URL, and call `apps/api` with a short-lived granted JWT after browser approval.
- A local agent can do the same flow with browser auto-open on the host machine.
- The full protected `apps/api` surface is represented as agent capabilities.
- Mutating routes are not auto-granted by default.
- Organization membership is enforced for agent JWT requests.
- Existing API key integrations keep working without changes.

## Open Questions To Revisit During Implementation

- Whether any especially sensitive routes should require stronger approval strength than the default mutating-route policy.
- Whether agent-auth events should also be written into a dedicated durable audit trail beyond application logs.
- Whether capability constraints should be introduced immediately for specific routes or deferred until after the base capability model is working.
