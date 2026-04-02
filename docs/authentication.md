# Authentication

Latitude authentication is powered by Better Auth and uses organization-aware sessions for all browser users.

The web auth surface supports:

- magic-link login
- OAuth login (Google, GitHub)
- organization invitations

There is no separate `/signup` page; all first-touch auth starts at `/login`, and first-time users are routed to `/welcome` for onboarding.

## Core auth boundaries

- `packages/platform/db-postgres`: `createBetterAuth` configuration and the Better Auth schema.
- `apps/web`: route handlers (`/login`, `/welcome`, `/auth/invite`) and server functions that call Better Auth APIs.
- `packages/domain/*`: domain-level use cases for repositories, organization naming, membership logic, etc.
- `apps/workers`: async email rendering and send for Better Auth magic-link and invitation events.

API boundaries in `apps/api` and `apps/ingest` use API key authentication, not Better Auth sessions.

Shared implementation: `packages/platform/api-key-auth` exports `validateApiKey`, which both apps call from their Hono middleware so cache TTLs, token hashing, minimum validation timing, and repository lookup stay aligned. `apps/api` additionally wires `onKeyValidated` to the touch buffer for batched `lastUsedAt` updates; ingest uses the same validator without that hook.

## Core invariants

1. Browser boundaries must have a Better Auth session (`getSession`) to access protected pages.
2. Organization-scoped browser logic requires `session.session.activeOrganizationId`.
3. If a user is signed in but has no active organization, they are routed to `/welcome`.
4. Invitation lifecycle uses Better Auth invitation records (`invitations` table).
5. There is no auth-intent table in the current auth architecture.

## Better Auth setup

`createBetterAuth` is defined in `packages/platform/db-postgres/src/create-better-auth.ts` and:

- Wires a Drizzle adapter with the Better Auth tables:
  - `users`
  - `sessions`
  - `accounts`
  - `verifications`
  - `organizations`
  - `members`
  - `invitations`
  - `subscriptions`
- Enables social providers when `LAT_GOOGLE_*` and `LAT_GITHUB_*` env vars are present.
- Adds `magicLink()` with one-hour expiry and attempt limits.
- Adds `organization()` for org membership APIs and invitation creation.
- Adds `tanstackStartCookies()` for session cookie compatibility in TanStack Start.
- Adds optional Stripe plugin when Stripe keys/webhook secrets are configured.

`sessions.active_organization_id` is persisted and returned in session payloads as `session.activeOrganizationId`.

## Auth endpoints and callbacks

`/api/auth` is the Better Auth API base path for verification and organization endpoints; the web UI consumes that client via `createAuthClient` in `apps/web/src/lib/auth-client.ts`.

- `apps/web/src/lib/auth-config.ts` sets `AUTH_BASE_PATH = "/api/auth"`.
- `apps/web/src/server/clients.ts` sets `LAT_WEB_URL` and passes callbacks to Better Auth:
  - `sendMagicLink`: writes `MagicLinkEmailRequested` outbox events.
  - `sendInvitationEmail`: writes invitation email events that point to `/auth/invite`.

## Web auth entry points

### `/login`

The `/login` route now owns both login and signup entry.

- Email login calls `sendMagicLink` via `apps/web/src/domains/auth/auth.functions.ts`.
- `callbackURL` defaults to `/`.
- If `?redirect=<path>` is present, `callbackURL` includes `emailFlow=signin` to keep login-specific email copy.
- New users land on `/welcome` via `newUserCallbackURL`.
- OAuth login calls `authClient.signIn.social({ provider, callbackURL, newUserCallbackURL, errorCallbackURL })`.
- OAuth failures return to `/login`.
- No custom `/auth/confirm`, `/auth/post-login`, or `/auth/onboarding` routes exist in this version.

### `/welcome`

`/welcome` is the single onboarding guard for sessions without an active organization.

- If there is no session, user is redirected to `/login`.
- The route loads all organizations for the user:
  - 1 organization -> `setActiveOrganization` then redirect `/`
  - multiple organizations -> user selects active organization
  - no organizations -> user is prompted for name and workspace name, then:
    - updates user profile (`updateUser`)
    - creates organization through Better Auth (`createOrganization`)
- All completed paths redirect back to `/`.

### `/auth/invite`

`/auth/invite` is the public invitation landing page and requires `invitationId` query param.

- Preview details are fetched with `getInvitationPreview` from the invitation repository (`pending`, public, not expired).
- If unauthenticated, user is redirected to `/login` with `redirect=/auth/invite?invitationId=...` and prefilled email.
- Authenticated users can:
  - accept invitation: `authClient.organization.acceptInvitation`
  - reject invitation: `authClient.organization.rejectInvitation`

## Organization and invitation APIs

Domain functions under `apps/web/src/domains/*` call Better Auth APIs for org membership operations:

- `createInvitation`
- `listInvitations`
- `cancelInvitation`
- `acceptInvitation`
- `rejectInvitation`
- `setActiveOrganization`

Server functions in `apps/web/src/domains/organizations/organizations.functions.ts` and `apps/web/src/domains/members/members.functions.ts` use these Better Auth APIs instead of custom intent records.

## Magic-link email flow

The system sends auth emails through the outbox + worker pipeline:

1. Better Auth invokes `sendMagicLink` / `sendInvitationEmail`.
2. `apps/web/src/server/clients.ts` publishes `MagicLinkEmailRequested` events.
3. `apps/workers/src/workers/domain-events/magic-link-email.ts` renders an appropriate template and sends the message.

Template selection is payload-driven:

- invitation template when `invitationId` is present and invitation email context exists
- standard magic-link template for other cases
- `signup`-specific template exists but is currently only used if the outgoing payload explicitly sets `emailFlow: "signup"`.

Invitation links generated for invites always include `invitationId` and route to `/auth/invite`.

## Session and authorization guards

`requireSession` (`apps/web/src/server/auth.ts`) is the canonical org-scoped helper and requires:

- authenticated user in session
- `activeOrganizationId` present in session payload

Missing org context throws `UnauthorizedError("No active organization in session")`.

`requireUserSession` requires only an authenticated user and is used for non-org-scoped actions.

At layout level, `apps/web/src/routes/_authenticated.tsx` also redirects:

- unauthenticated users to `/login`
- users without `activeOrganizationId` to `/welcome`

## Data model summary

Authentication and org tenancy rely on Better Auth tables in `packages/platform/db-postgres/src/schema/better-auth.ts`:

- `users`
- `sessions`
- `accounts`
- `verifications`
- `organizations`
- `members`
- `invitations`
- `subscriptions`

Important columns:

- `sessions.active_organization_id` (`session.activeOrganizationId`)
- `invitations.id`, `status`, `expires_at` (used for pending invitation preview + list/accept flows)
- no `auth_intent` table
