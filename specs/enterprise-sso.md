# Enterprise SSO (SAML 2.0 + OIDC)

> **Documentation**: `dev-docs/users.md`, `dev-docs/organizations.md`, `dev-docs/settings.md`

## Purpose

Let enterprise organizations sign in to Latitude through their own identity provider (Okta, Microsoft Entra, Google Workspace SAML apps, etc.) over SAML 2.0 or enterprise OIDC, configured self-serve by org owners/admins, gated behind an opt-in feature flag, with optional DNS domain verification and SSO enforcement.

## Decisions

- **Mechanism**: Better Auth's official `@better-auth/sso` plugin (SAML 2.0 + OIDC, `ssoProvider` table, organization binding, JIT user/member provisioning, built-in DNS domain verification, IdP-initiated flow controls). No hand-rolled SAML.
- **Config surface**: org owners/admins self-serve via a new org settings page (`settings/sso`). Backoffice involvement is limited to toggling the feature flag per org (already generic).
- **Gating**: new opt-in `"sso"` feature flag in `@domain/feature-flags`, enabled per-org from backoffice. Plan-based entitlement can replace this later.
- **Login UX**: email-domain matching on the existing `/login` page. When the entered email's domain has a **verified** SSO provider, the browser is redirected to the IdP instead of sending a magic link. No separate SSO entry point.
- **Enforcement semantics**: enforcement is keyed by **verified email domain**, not org membership. Users belong to multiple orgs and no active org exists pre-auth, so domain match is the only unambiguous, pre-auth-evaluable signal. A user whose email domain has a verified + enforced provider cannot sign in via magic link or Google/GitHub anywhere; users with non-matching (e.g. personal) emails are unaffected even if they are members of an enforcing org.
- **Registration is server-side only**: `authClient.sso.register` is never exposed to the browser. SAML certs and OIDC client secrets travel through TanStack server fns to `auth.api.registerSSOProvider`, where the feature flag and owner/admin role are checked before delegating (Better Auth re-checks owner/admin when `organizationId` is passed — defense in depth).
- **IdP-initiated SSO**: disabled (`allowIdpInitiated: false`) to avoid unsolicited-assertion risks. Can become a per-provider opt-in later.

## Architecture

### Plugin wiring

- `packages/platform/db-postgres/src/create-better-auth.ts` registers `sso({...})` in the static plugin list:
  - `organizationProvisioning: { disabled: false, defaultRole: "member" }` — SAML/OIDC sign-ins JIT-provision users and org memberships into the provider's bound organization.
  - `domainVerification: { enabled: true }` — DNS TXT verification flow.
  - `saml: { enableInResponseToValidation: true, allowIdpInitiated: false, requireTimestamps: true }`.
  - `disableImplicitSignUp: false` — new users are created on first SSO login.
- `BetterAuthConfig` gains `readonly isSsoEnforcedForEmail?: (email: string) => Promise<boolean>`, injected from `apps/web/src/server/clients.ts` using the admin postgres client and the `@domain/sso` predicate, consumed by a `hooks.before` guard on the social sign-in path.
- `apps/web/src/lib/auth-client.ts` adds `ssoClient()` (from `@better-auth/sso/client`) — used only for `authClient.signIn.sso(...)` redirects.
- `packages/platform/db-postgres/auth.cli.ts` mirrors the `sso()` plugin so `pnpm run auth:generate-schema-reference` stays in sync.
- Dependency: `"@better-auth/sso": 1.6.9` in the `pnpm-workspace.yaml` catalog (pinned to `better-auth`/`@better-auth/core` 1.6.9), added to `packages/platform/db-postgres/package.json` and `apps/web/package.json`.

### Data model

New table `latitude.sso_providers` in `packages/platform/db-postgres/src/schema/better-auth.ts` (ported from the Better Auth CLI schema reference, repo conventions: cuid PK, `tzTimestamp`/`timestamps()`, **no FKs**, indexes only):

| Column | Notes |
| --- | --- |
| `id` | cuid PK |
| `issuer` | IdP issuer / EntityID |
| `domain` | email domain the provider claims (lowercase) |
| `oidc_config` | text (JSON) — clientId, clientSecret, endpoints |
| `saml_config` | text (JSON) — entryPoint, IdP cert, SP metadata/keys |
| `user_id` | registering user |
| `provider_id` | unique slug used in callback URLs |
| `organization_id` | bound org (JIT membership target) |
| `domain_verified` | boolean, default false — set by DNS TXT verification |
| `enforced` | boolean, default false — **Latitude extension**: when true (and verified), non-SSO login is blocked for the domain |

RLS: `organizationRLSPolicy("sso_providers")`. This is safe because Better Auth's drizzle adapter runs on the admin (`latitude`) role which bypasses RLS, so unauthenticated sign-in reads work, while tenant-client reads (`getPostgresClient()`) stay scoped to the active org. Indexes on `organization_id`, `domain` (login-time lookup), `provider_id`.

The table is registered in the `drizzleAdapter` `schema` map.

### Domain package

Small `packages/domain/sso` package for the two pieces of logic that deserve fake-repo unit tests:

- `ports/sso-provider-repository.ts` — `findVerifiedByDomain(domain)`, `findEnforcedByDomain(domain)`.
- `use-cases/resolve-sso-for-email.ts` — email → verified provider match (or null). Case-insensitive on domain.
- `use-cases/is-sso-enforced-for-email.ts` — true only when a matching provider is verified **and** enforced.
- `testing/` — fake repository.

Live repository `SsoProviderRepositoryLive` in `@platform/db-postgres`.

### Web server fns (`apps/web/src/domains/sso/sso.functions.ts`)

All mutating fns: `requireSession()` → owner/admin check → `"sso"` feature-flag check → Effect use-case / `getBetterAuth().api` call.

- `registerSsoProvider` — discriminated-union input: SAML (`providerId`, `domain`, `issuer`, `entryPoint` + X.509 IdP cert, or full IdP metadata XML) | OIDC (`providerId`, `domain`, `issuer`, `clientId`, `clientSecret`). Delegates to `auth.api.registerSSOProvider({ body: { ..., organizationId }, headers })`.
- `getOrgSsoProvider` — reads through the **tenant** client (RLS-scoped). Returns non-secret fields plus computed URLs: SP metadata `/api/auth/sso/saml2/sp/metadata?providerId=...`, ACS `/api/auth/sso/saml2/callback/{providerId}`, OIDC callback `/api/auth/sso/callback/{providerId}`. **Certs and secrets are never returned to the client.**
- `verifySsoDomain` — returns the DNS TXT record (host + value) and triggers verification via Better Auth's domain-verify API.
- `updateSsoEnforcement` — toggles `enforced` (only allowed once domain is verified).
- `deleteSsoProvider`.
- `lookupSsoForEmail` — **unauthenticated**; must use `getAdminPostgresClient()` (the tenant client returns nothing pre-auth under RLS). Matches `domain = lower(emailDomain) AND domain_verified = true`; returns `{ providerId } | null`.

Plus `sso.collection.ts` (query + mutations, following the members/feature-flags collection patterns).

### Login flow

`apps/web/src/routes/login.tsx`: on email submit, call `lookupSsoForEmail` before `sendMagicLink`. On a match, call `authClient.signIn.sso({ email, callbackURL })` (browser redirects to the IdP) and show "Redirecting to your identity provider…"; otherwise the magic-link path is unchanged. Turnstile only guards `/sign-in/magic-link` and `/sign-in/social`, so the SSO redirect is unaffected — SSO endpoints must not be added to the captcha endpoint list.

### Enforcement

Shared predicate `isSsoEnforcedForEmail` (from `@domain/sso`) is enforced at two entry points:

1. **Magic link** — `apps/web/src/domains/auth/auth.functions.ts` `sendMagicLink`: check before sending; throw a typed error ("Your organization requires SSO sign-in") when enforced.
2. **Social (Google/GitHub)** — Better Auth `hooks.before` on the social sign-in path in `create-better-auth.ts`, using the injected predicate. SSO callback paths (`/sso/...`) are exempt.

### Settings UI

New route `apps/web/src/routes/_authenticated/projects/$projectSlug/settings/sso.tsx` (modeled on `members.tsx` / `integrations.tsx`; `useForm` + `createFormSubmitHandler` + `fieldErrorsAsStrings`), registered in the settings nav. Gated by `useHasFeatureFlag("sso")` (unavailable panel when off); mutations gated on owner/admin.

Sections:

- Provider type toggle (SAML | OIDC).
- SAML: paste IdP metadata XML, or entryPoint + X.509 cert + issuer. Copyable SP metadata URL, ACS URL, EntityID.
- OIDC: issuer, clientId, clientSecret. Copyable callback URL.
- Domain verification: domain input → TXT record display → "Verify" button → verified/unverified badge.
- Enforcement toggle (disabled until domain verified).

### Feature flag

`packages/domain/feature-flags/src/registry.ts` gains an `sso` entry. That alone makes `useHasFeatureFlag("sso")` available and the existing generic backoffice per-org toggle work. Gating checkpoints: settings nav visibility, `sso.tsx` body, every mutating server fn.

## Risks and mitigations

1. **Version skew** — pin `@better-auth/sso@1.6.9` to match core; verify `auth.api.registerSSOProvider` and the generated schema match the installed version before porting columns.
2. **RLS vs unauthenticated reads** — login-domain lookup and Better Auth internals must run on the admin client; a tenant-client lookup silently returns nothing pre-auth.
3. **`cookieCache: "compact"`** — verify the post-IdP-callback session sets `activeOrganizationId` (JIT-provisioned members must land in the bound org for `requireSession()`).
4. **ACS POST CSRF / trustedOrigins** — the IdP POSTs SAML responses cross-origin to the ACS URL; verify Better Auth accepts it and the SP-initiated state cookie survives the redirect-then-POST flow (SameSite).
5. **Secrets at rest** — `saml_config` / `oidc_config` store keys/secrets in plaintext columns (plugin behavior). They must never be selected into client-facing DTOs; column-level encryption is a possible follow-up.
6. **Multi-org edge** — domain-based enforcement blocks non-SSO login for the whole email domain, even for unrelated orgs. Accepted and documented.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Foundation: plugin, schema, flag

- [x] **P1-1**: Add `"@better-auth/sso": 1.6.9` to the `pnpm-workspace.yaml` catalog; add `catalog:` deps to `packages/platform/db-postgres/package.json` and `apps/web/package.json`; `pnpm install`.
- [x] **P1-2**: Add the `sso` feature flag to `packages/domain/feature-flags/src/registry.ts` (inert until toggled).
- [x] **P1-3**: Mirror `sso()` in `auth.cli.ts`; run `pnpm run auth:generate-schema-reference`; port `sso_providers` (plus the `enforced` column) into `src/schema/better-auth.ts` with RLS policy and indexes; register in the `drizzleAdapter` schema map.
- [x] **P1-4**: `pnpm --filter @platform/db-postgres pg:generate` + `pg:migrate` (`drizzle/20260605110400_add-sso-providers`).
- [x] **P1-5**: Register the `sso({...})` plugin in `create-better-auth.ts` with the options above; add `ssoClient()` to `auth-client.ts`. The HTTP mutation endpoints (`/sso/register`, `/sso/update-provider`, `/sso/delete-provider`, `/sso/request-domain-verification`, `/sso/verify-domain`) are blocked via `disabledPaths` — router-only 404, `auth.api.*` unaffected — so registration is exclusively server-fn driven. (`isSsoEnforcedForEmail` config lands in P4 with its hook.)

**Exit gate**:

- Migration creates `latitude.sso_providers` with RLS policy and indexes; `getBetterAuth()` boots with no schema warnings; `pnpm typecheck` passes.

### Phase 2 - Provider management (domain + server fns + settings UI)

- [x] **P2-1**: Create `packages/domain/sso` (port, `resolve-sso-for-email`, `is-sso-enforced-for-email`, `update-sso-enforcement`, fakes) with unit tests (16). Also added `SsoProviderId` to `@domain/shared`.
- [x] **P2-2**: Implement `SsoProviderRepositoryLive` in `@platform/db-postgres`; PGlite integration tests (10) pin RLS scoping (tenant sees own org only; cross-org domain lookup only through admin client), lowercase domain normalization, kind derivation, and org-scoped enforce/delete.
- [x] **P2-3**: Implement `apps/web/src/domains/sso/sso.functions.ts` (`registerSsoProvider`, `getOrgSsoProvider`, `getSsoDomainVerificationRecord`, `verifySsoDomain`, `updateSsoEnforcement`, `deleteSsoProvider`) + `sso.collection.ts`. Gating lives in `requireSsoAdmin` (flag + owner/admin); note: BA 1.6.9 only checks org *membership* at `registerSSOProvider`, so this server-fn role check is the authorization layer (HTTP mutation endpoints are 404 via `disabledPaths`). `lookupSsoForEmail` moves to P3 where it's consumed. Dedicated server-fn gating tests deferred — the gate composes two already-tested repos; covered by P5 manual verification.
- [x] **P2-4**: Build `settings/sso.tsx` (SAML/OIDC register forms, copyable ACS/SP-EntityID/SP-metadata/OIDC-callback URLs, DNS TXT verification card, enforcement toggle, remove-provider danger zone) and add the flag-gated "Single sign-on" nav entry in `project-sections.ts`.

**Exit gate**:

- With the flag on, an org owner registers a SAML and an OIDC provider end-to-end from settings; secrets absent from all network payloads; DNS TXT verify flips `domain_verified`; with the flag off the page shows unavailable and mutating fns reject.

### Phase 3 - Login flow

- [x] **P3-1**: Wire `lookupSsoForEmail` (unauthenticated server fn, admin client, returns only `{ providerId }`) into `login.tsx` email submit; redirect via `authClient.signIn.sso({ email, callbackURL, newUserCallbackURL })` on match; "Redirecting to your identity provider…" state. Turnstile untouched (captcha guards only `/sign-in/magic-link` + `/sign-in/social`).
- [ ] **P3-2**: Manual SAML round-trip against mocksaml.com using generated SP metadata/ACS URLs; confirm JIT user + member provisioning (`defaultRole: member`) and that the session gets `activeOrganizationId`.

**Exit gate**:

- Email on a verified SSO domain redirects to the IdP and completes a full SAML round-trip into the bound org; all other emails still receive a magic link.

### Phase 4 - Enforcement

- [x] **P4-1**: Block enforced domains in `sendMagicLink` (web server fn) with `ForbiddenError("Your organization requires SSO sign-in")` — stops issuance even when callers bypass the login page.
- [x] **P4-2**: Block non-SSO sign-ins via a `databaseHooks.session.create.before` hook in `createBetterAuth` (not `hooks.before` — session creation is the one choke point that knows the user for both new and existing accounts). Whitelist of enforced paths: `/callback/*` (social OAuth) and `/magic-link/verify` (covers links issued before enforcement flipped on); SSO callbacks, impersonation, and token flows pass untouched. Predicate injected via `BetterAuthConfig.isSsoEnforcedForEmail`, wired in `clients.ts` on the admin client.
- [x] **P4-3**: Enforcement toggle live in settings (disabled until domain verified; `updateSsoEnforcementUseCase` re-enforces the verified-domain invariant server-side); tests for the predicate (`@domain/sso`) and the session hook (`create-better-auth.test.ts`: blocks social + magic-link verify for enforced domains, exempts `/sso/*` callbacks, no-op without predicate).

**Exit gate**:

- With enforcement on for a verified domain: magic link and Google/GitHub are blocked with a clear message, SSO sign-in still works; other domains unaffected.

### Phase 5 - Hardening and rollout

- [ ] **P5-1**: Verify risk items: ACS POST acceptance (trustedOrigins/SameSite), cookieCache `compact` session shape. Captcha endpoint list verified untouched in code (`/sign-in/magic-link`, `/sign-in/social` only); the other two need the live SAML round-trip (P3-2).
- [x] **P5-2**: `pnpm typecheck`, `pnpm format`, `pnpm knip` green; tests green (`@domain/sso` 16, `@platform/db-postgres` 309 incl. 10 PGlite RLS pins + 6 enforcement-hook pins, `@app/web` 401). Boot smoke test: auth instance boots with the SSO plugin + enforcement hook; dev DB has `latitude.sso_providers` with all columns and `sso_providers_organization_policy`.
- [ ] **P5-3**: Enable the `sso` flag for one pilot org from backoffice; run the verification checklist with a real IdP (Okta dev tenant); then GA.
- [ ] **P5-4**: Promote durable knowledge into `dev-docs/users.md` / `dev-docs/organizations.md` / `dev-docs/settings.md` and delete this spec.

**Exit gate**:

- Pilot org signs in via their IdP in production; docs updated; spec retired.
