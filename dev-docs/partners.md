# Partners and the private partner API

A **partner** is a vetted third-party platform — an agent platform, an IDE vendor, a marketplace — that Latitude staff register by hand so it can call a small **private API** on behalf of its own users. The private API is not part of the public product surface: it never appears in `openapi.json`, `mcp.json`, either SDK, the CLI, or the docs site.

Today the private API does exactly one thing: **account provisioning**. Given an email and an organization name, Latitude creates the user, their organization, and an OAuth grant for the partner in a single signed request, and returns the token pair.

Related: [`mcp.md`](./mcp.md) (the OAuth 2.1 authorization server this piggybacks on), [`api.md`](./api.md) (the public surface and the `/v1/private/*` route class), [`organizations.md`](./organizations.md), [`users.md`](./users.md), [`authentication.md`](./authentication.md).

## Why it exists: two install paths, one destination

A partner offering "install Latitude" has to handle two kinds of user, and both must end up in the same place — the partner holding an OAuth access/refresh pair, and the end user seeing that partner in **Settings → Keys → OAuth Keys** with a revoke button.

```
Path A (user already has Latitude):
  partner ──DCR──▶ /api/auth/mcp/register
  user ──authorize + consent──▶ org binding ──▶ token exchange ──▶ tokens

Path B (user has no Latitude account):
  partner ──HMAC-signed──▶ POST /v1/private/partners/:partnerId/accounts ──▶ tokens

Both:
  tokens ──▶ /v1/* API · refresh at /api/auth/mcp/token · revocable in the OAuth Keys UI
```

Path A is the ordinary MCP OAuth flow and needs no partner registration at all. Path B exists because there is nobody to consent yet: the account does not exist. Everything the interactive flow would have written is written directly, minus the interaction.

**Provisioning never touches an existing account.** If the email already belongs to a Latitude user, the endpoint returns `409 account_already_exists` and the partner must fall back to path A, where the real user consents for themselves. This is the property that keeps the surface from being an account-takeover vector.

## The partner registry

`latitude.partners` is a **global, staff-managed table**: no `organization_id`, no RLS policy, because a partner is not tenant data.

| Column | Notes |
| --- | --- |
| `id` | CUID2. Appears in the request path and is the rate-limit key. |
| `name` | Copied onto the provisioned `oauth_applications.name` — this is what the end user sees in the Keys UI. |
| `icon_url` | Copied onto `oauth_applications.icon`, which has a `^https?://` CHECK. Validate at every boundary that writes it. |
| `redirect_urls` | `jsonb` array, at least one entry. The partner's OAuth callbacks, stamped comma-joined onto every provisioned `oauth_applications.redirect_urls` so an interactive re-authorize against a minted `client_id` passes BA's exact-match redirect check. Entries must be `https://` (plaintext `http://` only on loopback, per RFC 8252 §7.3) and comma-free, since a comma would split one URL across the join. |
| `hmac_secret` | AES-256-GCM ciphertext under `LAT_MASTER_ENCRYPTION_KEY`. Encrypted, not hashed: signature verification needs the raw value back. |
| `scopes` | `jsonb` array of `PartnerScope`. Gates which private endpoints the partner may call. |
| `allowed_ips` | `jsonb` array of IPs and/or CIDR blocks. Empty means unrestricted. |
| `enabled` | Staff kill-switch. A disabled partner fails verification immediately. |
| `deleted_at` | Soft delete. Also fails verification immediately. |

The API verifies signed requests on the ordinary runtime connection, since it has to read the registry on every partner request; every write goes through the backoffice on the admin connection. `PartnerRepositoryLive` carries a `SECURITY:` header explaining that contract, because its queries carry no org predicate.

The raw secret leaves the system exactly twice: once when the partner is created, once per rotation. It is never on the `Partner` entity, never in a list response, and never in an audit event.

## Request authentication

Stripe-style HMAC signing. The in-repo cousin is the GitHub webhook's `X-Hub-Signature-256` verification.

```
X-Partner-Timestamp: <unix seconds>
X-Partner-Signature: v1=<lowercase hex HMAC-SHA256>
X-Partner-Nonce:     <required, 8-200 chars of [A-Za-z0-9_-]>

string_to_sign = "v1:" + timestamp + ":" + METHOD + ":" + pathname + ":" + nonce + ":" + sha256hex(rawBody)
```

`METHOD` is uppercased; `pathname` is the full request path including `/v1`, without the query string. The body hash covers the raw bytes, so the endpoint reads `c.req.text()` **before** parsing JSON.

**The nonce is inside the signed string, and that is the whole point.** Sign everything *except* the nonce and the replay store stops meaning anything: a captured request replays inside the timestamp window under a fresh nonce the store has never seen, and the signature still validates. Binding it makes the two halves work together — change the nonce and the signature breaks, reuse it and the store rejects it. The charset is colon-free so a nonce cannot shift the field boundaries of the signed string, and length-bounded so it cannot bloat the replay keyspace.

Checks run in this order (`createPartnerAuthMiddleware` → `verifyPartnerRequestUseCase`):

1. **Load the partner** by path id. Unknown, soft-deleted, or disabled ⇒ fail.
2. **IP allowlist**, when the partner has a non-empty one ⇒ see below.
3. **Headers present and well-formed**: timestamp, signature, and nonce. A missing or malformed nonce ⇒ fail.
4. **Timestamp** within ±300s of the server clock.
5. **Signature**, recomputed and compared in constant time (`verifyHmacSha256Hex`).
6. **Scope**: the route declares the scope it needs; the partner's `scopes` must contain it.
7. **Claim the nonce**, only now: `SET org:system:partner:<id>:nonce:<nonce> NX EX 600`. A duplicate ⇒ fail.

Step 7 is deliberately last. Reserving the nonce before the signature verifies would let an unauthenticated caller spend a nonce it cannot sign for, turning the partner's real request into a 401 — a free denial of service against one specific request.

**Failure discipline.** Checks 1–5 and 7 all return the identical `401 {"error": "unauthorized"}`. An unknown partner id must be indistinguishable from a bad signature, or the surface becomes an id oracle. The real reason is logged server-side — never the presented signature. Only check 6 gets a distinct `403 {"error": "insufficient_scope"}`, because by then the caller has already proven who they are.

Redis-dependent steps (the nonce claim, both limiters) **fail open**, like every limiter in the repo: a Redis outage must not take the partner API down, and the signed timestamp already bounds replay.

### IP allowlist

Each partner carries a list of allowed source addresses. It is **opt-in per partner**: an empty list accepts any address, which is what keeps local development and unproxied environments working.

Entries are single addresses or CIDR blocks, in either family — `203.0.113.7`, `203.0.113.0/24`, `2001:db8::1`, `2001:db8::/32`. The caller's address is the **last `X-Forwarded-For` hop** (`trustedClientIp`), so the check is only meaningful behind a load balancer that sets the header. The last hop, not the first: the header is append-only and everything to the left of the final entry was supplied by the caller, so reading the first would let anyone name an allowed address and walk straight through the allowlist. A caller with no `X-Forwarded-For`, or one the parser cannot read, never matches a non-empty list: an unidentifiable caller is refused rather than waved through.

Matching lives in `ip-allowlist.ts` in `@domain/partners` and is dependency-free — addresses are compared as bigints over their bits, so both families share one code path. Two behaviors worth knowing:

- **IPv4-mapped IPv6 is folded down.** A load balancer reporting `::ffff:203.0.113.7` matches a plain `203.0.113.7` rule, and the mirror image works too. Without this, the same client would match or miss depending on the proxy's address formatting.
- **Host bits in an entry are ignored.** `203.0.113.7/24` means the `203.0.113.0/24` network, as every other CIDR tool treats it.

An entry that fails to parse never matches anything, so a typo in the allowlist locks the partner out rather than opening it up. The backoffice rejects an unparseable line at the server boundary and surfaces the error on the field, so a typo should not reach the column in the first place.

### Rate limiting

Two limiters stacked, mirroring the public bootstrap endpoint:

1. `createPartnerRateLimiter({ maxRequests, windowSeconds })` — keyed `partner:<id>` from the path param; the provisioning route declares 100 req/min. Each private route declares its own quota rather than sharing a tier, since they are not interchangeable in cost. Rejects one greedy partner cheaply.
2. `createGlobalRateLimiter({ key: "partner-account-provision", maxRequests: 1000, windowSeconds: 60 })` — a total cap regardless of caller.

A per-partner key matters because a signed request carries no organization, and IP-keying would lump every partner behind a shared egress gateway into one bucket.

Both limiters sit **ahead of authentication**, so a refused request still consumes quota. That is deliberate: a caller spraying bad signatures gets cut off rather than costing a signature verification per attempt.

## Account provisioning

```
POST /v1/private/partners/:partnerId/accounts
{
  "user": { "email": "...", "name": "...", "image": "...", "phone": "...", "job": "..." },
  "organization": { "name": "..." }
}
```

Only `user.email` is required. The optional fields exist because a provisioned user **never sees the onboarding questionnaire**: that form is step one of *project* onboarding, which the authenticated loader only reaches when an organization has no projects — and a partner creates projects immediately after provisioning. So anything the form would have collected has to arrive here or be derived now:

- `user.name` falls back to `deriveDisplayNameFromEmail` — `ada.lovelace@…` becomes `Ada Lovelace`.
- `organization.name` falls back to `deriveOrganizationNameFromDisplayName` — `Ada Lovelace's Organization`.
- `heardAboutUs` on the user row is always the partner's name. Nothing asks the user later, and it is what reaches Loops. PostHog gets the partner from `UserSignedUp`'s `partnerId` / `partnerName` instead.

The one gap: if a partner provisions an account and creates **no** projects, that user does hit onboarding on first sign-in, and submitting the form overwrites `heardAboutUs`. Nothing prevents it today; the field is a best-effort attribution, not an audit record — `PartnerAccountProvisioned` is the durable one.

A **plain `app.post`** — never `app.openapi`, never `defineOperation`. That is what keeps it out of every generated surface, and the CI manifest-drift gate keeps it that way. It is mounted on `v1` ahead of the auth wall, so it inherits the context injector but not bearer auth.

`provisionPartnerAccountUseCase` runs in one transaction **on the admin client** — the `oauth_applications` insert is RLS-guarded on the very organization being created, the same reason the consent server fn and the bootstrap endpoint use it. In order:

1. Normalize `email` (trim + lowercase). Every stored address is lowercase — Better Auth normalizes centrally in `internalAdapter.createUser`, and `UserRepository.create`, the one path that bypasses it, does the same. That invariant is what lets the lookups compare the column as-is and use the plain unique index on `users.email` instead of forcing a sequential scan over `lower(email)`.
2. Reject an existing user (`findOptionalByEmail`) with `ConflictError` → 409. A unique-violation from step 3 maps to the same 409, so two concurrent provisions for one email produce one account and one clean conflict rather than a 500.
3. Create the user: `emailVerified: false`, name and profile fields per the request, `heardAboutUs` set to the partner's name. The partner asserts the email; it has not proven it.
4. Create the organization with a unique slug and **`expiresAt: null`** — a real account from birth, not a bootstrap temporary. Nothing to claim, nothing for the reaper.
5. Create the owner membership directly (the claim-flow precedent).
6. Create the OAuth grant — application, access token, consent — via `OAuthGrantRepository`.
7. Write four outbox events.

Response (snake_case, mirroring the OAuth token endpoint so partner code can share one handler across both paths):

```json
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer",
  "expires_in": 3600, "scope": "openid offline_access",
  "client_id": "...", "organization_id": "...", "organization_slug": "...", "user_id": "..." }
```

| Status | Meaning |
| --- | --- |
| 201 | Created. |
| 400 | `invalid_request` + Zod issues. Only reachable **after** authentication. |
| 401 | `unauthorized` — uniform, see above. |
| 403 | `insufficient_scope`. |
| 409 | `account_already_exists` — fall back to path A. |
| 429 | Either limiter, with `Retry-After`. |

No default project and no organization API key are created, unlike bootstrap and onboarding. Creating those is the partner's post-install job through the public API — identical work on both paths, and it keeps this endpoint minimal.

### The grant rows must be indistinguishable from consent-minted ones

This is the constraint that makes everything downstream work unmodified: the token validator, the refresh grant, the OAuth Keys list, and revocation all treat a provisioned grant exactly like one a human consented to.

```
oauth_applications:  name = partner.name, icon = partner.iconUrl
                     metadata = {"partnerId": "...", "provisioned": true}
                     client_id = 32 × [a-zA-Z], client_secret = "", type = "public"
                     redirect_urls = partner.redirectUrls comma-joined, disabled = false,
                     user_id, organization_id

oauth_access_tokens: access_token / refresh_token = 32 × [a-zA-Z]
                     TTLs 3600s / 604800s, scopes = "openid offline_access"

oauth_consents:      consent_given = true    (audit parity; nothing reads this table)
```

Four details are load-bearing:

- **`generateOAuthClientString()`** produces 32 rejection-sampled characters from `[a-zA-Z]`, mirroring Better Auth's `generateRandomString(32, "a-z", "A-Z")`. Not `randomToken`, which is hex and visibly different.
- **`type: "public"` with an empty secret** means the refresh grant needs only `client_id` + `refresh_token`, so the partner carries no second credential.
- **`scopes` must contain `offline_access`** or Better Auth's refresh grant refuses the row outright. The full string equals the AS `defaultScope` in `apps/web/src/server/clients.ts`, so a partner who instead sends the user through the interactive flow gets a byte-identical grant — the docs tell them to request exactly `openid offline_access`. Nothing in the API gates on scopes (`AuthContext.scopes` is carried and never read), so the string is parity, not permission.
- **`redirect_urls` carries the partner's registered callbacks, never `NULL`.** Better Auth's refresh handler calls `res.redirectUrls.split(",")` unconditionally, so a `NULL` turns every refresh into a 500. Stamping the partner's real callbacks (rather than the `""` this used to write) is what lets the partner re-run the interactive authorize flow against a minted `client_id` — BA validates the request's `redirect_uri` by exact match against this list, and the pre-written consent row makes that re-authorize silent. That keeps a returning provisioned user on the same `(client_id, user_id)` pair, i.e. the same row in the Keys UI.

`PARTNER_ACCESS_TOKEN_TTL_SECONDS` and `PARTNER_REFRESH_TOKEN_TTL_SECONDS` are **mirrored from Better Auth, not imported**. If BA's defaults change, or the repo ever sets TTL overrides on the `mcp` plugin, update the constants to match.

**One `oauth_applications` row per provisioned account.** The org binding is a column on the application row, so a single shared partner-wide row would re-bind on every provision and orphan every earlier grant's org context. The partner's identity lives in `name` / `icon` / `metadata.partnerId` instead.

### Events

| Event | Why |
| --- | --- |
| `UserSignedUp` | Parity with Better Auth's `onUserCreated` hook, which this flow bypasses. Carries `partnerId` and `partnerName`, set only here and absent on organic signups — this is the **only** signup event PostHog receives, so one funnel compares partner-driven signups against organic ones. Also drives marketing-contact registration, which forwards `jobTitle` / `phoneNumber` / `heardAboutUs` straight from the row: for a provisioned user that is the only Loops sync that will ever happen, since `updateContact` normally fires from `UserOnboardingCompleted` and they never reach onboarding. |
| `OrganizationCreated` | Parity with `completeOnboardingUseCase`. |
| `OAuthKeyCreated` | Parity with the consent flow's accept branch, so the Keys story is identical. |
| `PartnerAccountProvisioned` | The audit record for the private surface: which partner minted which account, and when. Deliberately **not** fanned out to PostHog — `UserSignedUp` already carries the partner, and tracking both would double-count every partner signup. Carries `partnerName` alongside `partnerId` so audit queries need no join against the registry. |

`MemberJoined` is deliberately **not** emitted — direct membership writes skip it, matching the claim flow.

## What the end user gets

The provisioned user owns a real organization from the first millisecond. They have no password (Latitude has no password auth) and `emailVerified: false`.

- **Signing in** is the **magic link**, with the email the partner supplied. It both proves ownership and flips `emailVerified` to `true`. Nothing had to be built for this.
- **Social login won't implicit-link** — that is disabled repo-wide, so a pre-created user who tries Google gets `account_not_linked` and is directed to the email flow. This is intentional: implicit linking on a partner-asserted email would be a takeover path.
- **First login runs the normal onboarding flow**, which adds a default project to their existing organization. No second organization is created.
- **Revoking the partner** is the ordinary OAuth Keys flow: it deletes the pair's token rows, busts the Redis validation cache per token, and disables the application when no tokens remain. Access dies within seconds, for the current access token *and* any token minted from a refresh.

## Backoffice lifecycle

Partners are managed only at `/backoffice/partners`, by platform staff (`users.role === "admin"`), under the usual three guards. There is no public or managed API for partner records.

- **Create** returns the raw secret once, in a modal, next to the partner id. Both are copyable; neither is ever readable again.
- **Edit** changes name, icon URL, redirect URLs, scopes, and the IP allowlist. It does not touch the secret.
- **Rotate** is a **hard swap**: the new secret replaces the old one immediately, with no grace window. Signatures made with the old secret start failing the moment it returns — which is what makes rotation double as revocation of a leaked secret. Coordinate the cutover with the partner out of band.
- **Disable** and **delete** (soft) both kill verification instantly at check 1. Neither touches accounts the partner already provisioned; those grants keep working until their end users revoke them.

Every mutation writes an audit event with `organizationId: "system"`: `AdminPartnerCreated`, `AdminPartnerUpdated`, or `AdminPartnerDeleted`. The **use-case** publishes it, in the same `sqlClient.transaction` as the row it describes, so an audit record can never go missing behind a mutation that succeeded. The server fn only forwards `adminUserId` off the session — it holds no outbox plumbing of its own. This is the same shape as `createProjectUseCase`, and unlike the other backoffice audit events (`AdminUserRoleChanged`, `AdminUserEmailChanged`), which write from the server fn because their mutation goes through Better Auth's HTTP API and has no transaction to join.

Edits, enable/disable, and secret rotation all land on `AdminPartnerUpdated`, which carries a `changes` array naming the entity fields that moved — `name`, `iconUrl`, `redirectUrls`, `scopes`, `allowedIps`, `enabled`, `hmacSecret` — and no values. That keeps "who touched what, and when" answerable without an event ever carrying a secret, and without a rotation needing an event type of its own.

## Scopes

`PartnerScope` is a literal union in `@domain/partners`. Today it has one member:

| Scope | Grants |
| --- | --- |
| `accounts:provision` | `POST /v1/private/partners/:partnerId/accounts` |

Scopes are per-endpoint and default to empty. A new private endpoint must declare a **new** scope literal, so an existing partner can never silently gain the ability to call it.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Discovering the endpoint | Absent from every generated surface and doc; uniform 401 without a valid signature; per-partner and global rate limits. |
| Leaked partner secret | Encrypted at rest; shown once; rotation is an instant hard swap; disable and soft-delete both kill verification immediately. A non-empty IP allowlist is the second factor: a stolen secret is unusable from an address the partner did not declare. |
| Replayed request | Timestamp **and** nonce inside the signed string: a ±300s window bounds how long a capture is worth anything, and the single-use nonce refuses the capture itself. Neither alone is sufficient — an unsigned nonce is trivially swapped. |
| Tampering | The signature covers method, path (including the partner id), and a hash of the raw body. |
| Partner-id / email enumeration | Uniform 401 for every pre-scope failure. The 409 is only reachable by a caller who already holds a valid secret — accepted, because the partner has to know whether to fall back to path A. |
| Account takeover | Provisioning refuses existing emails, so it can never attach to someone's account. Provisioned users have no credentials; the only ways in prove email ownership. |
| A malicious or compromised partner | **Accepted residual risk by design.** Partners are vetted and staff-registered. The blast radius per call is one brand-new empty organization for an email that has no Latitude account; existing users and orgs are untouchable through this surface. Every call is audited, rate-limited, and revocable in bulk by disabling the partner. |
| Token theft from the response | Same exposure class as path A's token exchange. Tokens expire in 1h / 7d and are user-visible and revocable from the moment they exist. |

Residual and accepted: a database compromise **plus** a `LAT_MASTER_ENCRYPTION_KEY` compromise reveals partner secrets — the same class as `api_keys.token` today.

## Deliberately out of scope

- Scope **enforcement** on public `/v1` routes for OAuth tokens. Scopes are stored there and never checked; that is unchanged.
- Per-partner custom rate limits, a partner self-service portal, an outbound webhook channel (e.g. revocation notifications), and multi-org provisioning for one email (409 covers it).

## Local development

`pnpm pg:seed` registers one partner so the flow is exercisable with no configuration:

| | |
| --- | --- |
| id | `oimduget8sjsc6xqma6sv8c4` |
| name | `Longitude` (fictional — never seed a real company, the name is visible in the backoffice and in the provisioned org's OAuth Keys) |
| secret | `longitude-dev-secret-do-not-use-in-prod-0000000000` |
| redirect URLs | `["http://localhost:4321/oauth/callback"]` — the demo server's default address |
| scopes | `["accounts:provision"]` |
| allowed IPs | empty (unrestricted) — local requests carry no `X-Forwarded-For` |

The local demo (a mock third-party agent platform, outside this repo) ships these as its env defaults. Its backend is the reference implementation of the signing scheme — it exists precisely because the HMAC secret must never reach a browser.
