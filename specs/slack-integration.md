# Slack integration

> **Documentation (future)**: `dev-docs/slack-integration.md` once Phase 3 stabilizes; cross-link from `dev-docs/notifications.md` (Slack channel section).

## Context

Latitude needs a first-party Slack integration. The first concrete feature is **routing notifications to Slack channels**, configurable per organization. A future feature is a **mentionable bot**: org members `@latitude` in a channel and the bot does work and replies. The infrastructure must support that second feature without requiring customers to re-install the Slack app.

The notification system already anticipates Slack as a new channel (see `dev-docs/notifications.md`, "Adding a new channel"), but its existing per-user / per-channel preference model was written assuming user-bound channels like email. Slack is a **shared channel** surface: a single message goes to a Slack channel, regardless of how many org members exist. This spec resolves that gap and lays out the staged delivery.

## Goals

- An org admin can connect their Slack workspace to Latitude through a standard OAuth install ("Add to Slack").
- One Slack workspace ↔ one Latitude organization (live install). Re-installing replaces the previous install.
- Per notification group (`incidents`, `wrapped_reports`, ...), the org configures **zero or more Slack channels** to deliver to. When a notification fires, one Slack message goes to each configured channel.
- Tokens are encrypted at rest using the existing AES-256-GCM helper.
- The pipeline change for Slack is parallel to (not a replacement for) the existing per-recipient in-app + email fan-out.
- Future-proofing for `@latitude` mentions: OAuth scopes and Slack-app event subscriptions are designed so adding mention handling later requires zero customer action (no re-install, no re-OAuth).
- All gated behind a `slack` feature flag.

## Decisions

- **Fan-out model**: Slack is a **per-channel** dispatch path, **not** per-user. Producer steps emit one `notification-slack:send` task per configured route, parallel to per-recipient `create-notification` fan-out. `channelPreferencesSchema` on users is **not** extended with a `slack` key (it doesn't apply).
- **Routing storage**: jsonb on `organizations.settings.slack.routes`, keyed by notification group. Matches the existing `projects.settings.notifications` pattern. If per-route metadata (audit, paused-state) or project-level overrides become needed, promote to a dedicated `slack_notification_routes` table — the change is local to the producer step.
- **Project-level overrides**: not in v1. Org-only routing.
- **Token rotation**: **on**. The Slack app has "Token Rotation Enabled" toggled, so OAuth responses include `refresh_token` + `expires_in: 43200` (12-hour access tokens). The schema's nullable `refresh_token` and `token_expires_at` columns get populated from day one of Phase 1; the install flow already extracts and persists them. Refresh-on-use is owned by `@slack/oauth` via `installer.authorize()` in Phase 3 workers — Phase 1's CLI never makes a Slack API call after the install, so it doesn't exercise refresh.
- **`@slack/oauth` adoption**: we use the official SDK for the OAuth machinery from Phase 1 on the URL-generation + code-exchange paths (so Phase 2 doesn't immediately rewrite Phase-1 code). `buildSlackAuthorizeUrl` delegates to `InstallProvider.generateInstallUrl` with a caller-supplied state token; `exchangeOAuthCode` uses `WebClient.oauth.v2.access` from `@slack/web-api`. Phase 2 adds a thin `LatitudeInstallationStore` adapter (backed by `SlackIntegrationRepository`) so the SDK's `InstallationStore`-consuming surfaces — `handleCallback` if we adopt it, and `installer.authorize()` in the Phase 3 notifications worker for refresh-on-use — see one source of truth. The schema, repository, encryption pattern, and HMAC signature verifier stay ours.
- **Channel-name display**: cache `channelName` alongside `channelId` in the routes jsonb, but treat it as best-effort. Re-resolve via `conversations.info` on a TTL or on demand. The id is the source of truth.
- **One workspace ↔ one org**: enforce via partial unique index `UNIQUE (kind, vendor_account_id) WHERE revoked_at IS NULL` on the parent `integrations` table. Installing into a workspace already connected to a different Latitude org returns an explicit error to the installer.
- **Persistence layout**: parent `integrations` table holds the cross-vendor lifecycle (`kind`, `vendor_account_id`, `installed_at`, `revoked_at`); per-vendor `<vendor>_integration_details` tables hold the vendor-specific shape (Slack: encrypted bot token, scopes, app id, …). 1:1 relationship by `integration_id`, application-layer integrity (no FKs per repo rule). The split lets the cross-org workspace claim live as a clean partial unique index on real columns (`vendor_account_id` is in the parent), while keeping vendor-specific schemas evolvable without parent-table churn. Telegram, Discord, GitHub Apps, … all add their own `*_integration_details` tables without touching the parent.
- **Feature flag**: single `slack` flag in `feature-flags`. Gates the connect button, the settings UI, the producer's Slack-route lookup, and (when added) the events webhook.
- **Encryption key**: reuse `LAT_MASTER_ENCRYPTION_KEY` (the same key used by `api_keys`). One key per environment. The repository accepts either a 32-byte hex string directly or any other secret hashed to 32 bytes via SHA-256, matching the api-keys derivation rule.
- **OAuth scopes at install time**: include `app_mentions:read` even though it's unused in Phases 2 and 3, so Phase 4 (mentions) does not require a customer re-install. Full v1 scope set: `chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `team:read`, `app_mentions:read`.
- **Slack apps per environment**: one Slack app per environment (`development`, `staging`, `production`) so OAuth callback URLs and (future) event subscription URLs are environment-scoped.

## Architecture

### Slack app (single, owned by Latitude)

One Slack app per environment, configured at api.slack.com/apps. Per-environment values:

- OAuth redirect URL: `https://<host>/integrations/slack/oauth/callback`
- Bot scopes (locked at install time): `chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `team:read`, `app_mentions:read`
- Event subscription URL: `https://<host>/api/slack/events` — configured in the Slack app but **not subscribed to any events** until Phase 4. Slack only POSTs to this URL once we subscribe to events.
- Distribution: **Public** for staging/production (so customer workspaces can install). The development Slack app stays on **Internal** distribution in Phase 1 because Slack requires HTTPS endpoints for Public distribution and dev runs on `http://localhost`. The flip happens when staging stands up in Phase 2.

Env vars (`LAT_` prefix, parsed via `parseEnv` from `@platform/env`):

```
LAT_SLACK_CLIENT_ID            # public
LAT_SLACK_CLIENT_SECRET        # secret
LAT_SLACK_SIGNING_SECRET       # secret; used to verify webhook requests in Phase 4
LAT_MASTER_ENCRYPTION_KEY      # reused; already documented for api_keys
```

### Tables

Two tables: a generic parent that owns the lifecycle and the cross-vendor invariants, and a Slack-specific 1:1 details table that owns the vendor shape.

```text
integrations
  id                      cuid PK
  organization_id         cuid NOT NULL
  kind                    varchar(64) NOT NULL   -- 'slack' | (future) 'telegram' | ...
  vendor_account_id       text NOT NULL          -- Slack team_id; Telegram bot username; etc.
  installed_by_user_id    cuid NOT NULL          -- Latitude user that drove the OAuth flow
  installed_at            tzTimestamp NOT NULL
  revoked_at              tzTimestamp            -- soft-revoke for audit
  ...timestamps()

  UNIQUE (organization_id, kind)         WHERE revoked_at IS NULL  -- one active integration per kind per org
  UNIQUE (kind, vendor_account_id)       WHERE revoked_at IS NULL  -- one active claim per vendor account
  index on (organization_id)
  index on (kind, vendor_account_id)
  RLS by organization_id
```

```text
slack_integration_details
  integration_id          cuid PK                -- 1:1 with integrations.id; no FK (app-layer integrity)
  organization_id         cuid NOT NULL          -- denormalized for RLS scoping
  team_name               text NOT NULL          -- display cache; authoritative id is integrations.vendor_account_id
  app_id                  text NOT NULL
  bot_user_id             text NOT NULL          -- U01...; for self-mention filtering later
  bot_access_token        text NOT NULL          -- AES-256-GCM encrypted
  bot_token_scopes        text NOT NULL          -- comma-joined granted scopes
  refresh_token           text                   -- nullable; encrypted when present
  token_expires_at        tzTimestamp            -- nullable; null when rotation off
  ...timestamps()

  index on (organization_id)
  RLS by organization_id
```

No FK constraints, per the platform rule. The 1:1 invariant is application-layer: install writes both rows in a single `SqlClient.transaction`; revoke updates only the parent's `revoked_at` (details rows are retained for audit). Adding a future vendor is one new `<vendor>_integration_details` table — no parent migration.

### Routing config (jsonb on `organizations.settings`)

`OrganizationSettings` gains a `slack` sub-shape:

```ts
slack: {
  routes: {
    incidents:       Array<{ channelId: string; channelName: string }>
    wrapped_reports: Array<{ channelId: string; channelName: string }>
    // ...one per NotificationGroup
  }
}
```

Missing entries default to `[]` (no Slack delivery for that group). Routes survive a Slack disconnect — re-connecting the same workspace restores them. `channelName` is a display cache; the producer step uses `channelId` only.

### Ephemeral OAuth state

CSRF state for the OAuth handshake lives in Redis under `org:${organizationId}:slack:oauth-state:${state}`, value `{ userId, organizationId, createdAt }`, TTL 10 minutes. No Postgres table.

### OAuth install flow

```
1. User clicks "Connect Slack" in settings
   → GET /integrations/slack/install (apps/web)
   → write state in Redis
   → 302 to https://slack.com/oauth/v2/authorize?client_id=…&scope=…&state=…&redirect_uri=…

2. User approves in Slack
   → Slack 302s to /integrations/slack/oauth/callback?code=…&state=…

3. Callback handler (apps/web)
   → validate state (CSRF + binds org + user)
   → POST https://slack.com/api/oauth.v2.access (code + client_id + client_secret)
   → extract { access_token, team.id, team.name, bot_user_id, scope, app_id, authed_user.id }
   → if another live install exists for team.id under a different organization_id → error
   → in a single transaction: insert into integrations
     (kind='slack', vendor_account_id=team.id) and slack_integration_details
     (encrypted bot token, scopes, team_name, …)
     - on (organization_id, kind) conflict where revoked_at IS NULL → soft-revoke
       the prior parent row first, then re-insert
   → 302 to settings page
```

### Notification dispatch (Phase 3)

The producer step in `apps/workers/src/workers/notifications.ts` adds a Slack fan-out **in parallel to** the existing per-recipient fan-out:

```text
request-{incident,wrapped-report}-notifications:
  ... existing per-recipient create-notification fan-out ...

  slackEnabled  = featureFlags.isEnabled("slack", organizationId)
  integration   = slackIntegrationRepo.findActiveByOrganizationId(organizationId)
  routes        = organization.settings?.slack?.routes?.[group] ?? []

  if slackEnabled AND integration AND routes.length > 0:
    for each route in routes:
      pub.publish("notification-slack", "send", {
        organizationId,
        kind: notificationKind,
        payload,                       // matches NOTIFICATION_KIND_META[kind].payload
        idempotencyKey,                // same producer-computed key
        channelId: route.channelId,
        projectId,                     // cascade anchor (informational; no projects.settings dependency)
      }, {
        dedupeKey: `notification-slack:${organizationId}:${idempotencyKey}:${route.channelId}`,
      })
```

The `notification-slack:send` worker (`apps/workers/src/workers/notification-slack.ts`) follows the same claim-then-act pattern as the emailer:

- Maintain a per-kind renderer registry in `@domain/integrations/templates/notifications/` keyed on `NotificationKind` (exhaustive `Record<NotificationKind, SlackRenderer>` — TS forces a renderer for every kind).
- Claim-then-act idempotency surface: TBD in Phase 3. Options: (a) a thin `slack_deliveries(idempotency_key, channel_id)` table mirroring `notifications.emailed_at`; (b) reuse the BullMQ `dedupeKey` and accept Slack's lack of native idempotency. Decide when implementing Phase 3.
- On 401 / `token_revoked` from Slack → soft-revoke the parent `integrations` row (set `revoked_at`), surface in settings, stop attempting delivery. The Slack details row is retained for audit.

### Mentions (Phase 4, future)

When the chat feature is built:

- Add `app_mention` to the Slack app's "Subscribed bot events". No new bot scope is needed (`app_mentions:read` was requested up front).
- Configure the event subscription URL on the Slack app (the URL itself exists from Phase 1's app config, but no events are sent until subscribed).
- Ship `apps/web/src/routes/api/slack/events.ts`: verify `x-slack-signature` (HMAC-SHA256 of `v0:${timestamp}:${rawBody}`), reject timestamps > 5 min old, handle the `url_verification` challenge inline, enqueue `slack-events:mention`, return 200 in <3s.
- Worker `apps/workers/src/workers/slack-events.ts` consumes `slack-events:mention`, runs the chat logic, posts a reply via the bot token.

Customers do **not** need to re-install — the scopes are already there.

## Code layout

| Package / app | Responsibility |
| --- | --- |
| `packages/platform/slack` | `createSlackClientEffect` wrapping `@slack/web-api`, OAuth code-exchange + refresh helpers, signature verification, token encrypt/decrypt at the package boundary |
| `packages/domain/integrations` | `SlackIntegration` entity, `SlackIntegrationRepository` port, `SlackMessenger` port (for posting), use cases: `installSlackIntegrationUseCase`, `revokeSlackIntegrationUseCase`, `listSlackChannelsUseCase`, `configureSlackRouteUseCase`, `removeSlackRouteUseCase`, `dispatchSlackNotificationUseCase` (per-kind renderer registry lives here under `templates/notifications/`) |
| `packages/platform/db-postgres` | `schema/slack-integrations.ts` + repository adapter |
| `packages/domain/queue` | New topics: `notification-slack` (`send`), `slack-events` (`mention` — Phase 4) |
| `apps/web/src/routes/_authenticated/settings/integrations/slack` | Settings UI (connect button, connection card, per-group channel pickers) |
| `apps/web/src/routes/integrations/slack/install` | OAuth start (write state to Redis, redirect to Slack) |
| `apps/web/src/routes/integrations/slack/oauth/callback` | OAuth callback (validate state, exchange code, persist integration, redirect to settings) |
| `apps/web/src/routes/api/slack/events.ts` | Public webhook endpoint (Phase 4) |
| `apps/workers/src/workers/notification-slack.ts` | Channel worker, per-kind Slack renderer dispatch (Phase 3) |
| `apps/workers/src/workers/slack-events.ts` | Mention worker (Phase 4) |

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 — Compatibility layer

Goal: a Latitude developer can drive the OAuth flow end-to-end via a script (or curl) and verify a parent `integrations` row + a `slack_integration_details` row land with the bot token encrypted. Nothing user-visible.

- [x] **P1-1**: Slack app created in development env. Manifest covers OAuth redirect URL, bot scopes (`chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `team:read`, `app_mentions:read`). Distribution stays Internal for Phase 1 (Public requires HTTPS endpoints — deferred to Phase 2 + staging). Credentials captured into `.env`.
- [x] **P1-2**: Env vars (`LAT_SLACK_CLIENT_ID`, `LAT_SLACK_CLIENT_SECRET`, `LAT_SLACK_SIGNING_SECRET`) added to `.env.example` as commented placeholders. Loaded together via `loadSlackConfig` in `@platform/slack/src/config.ts` using `parseEnvOptional` — missing-but-required-together returns `undefined` so callers cleanly disable Slack-dependent surfaces. `LAT_MASTER_ENCRYPTION_KEY` is reused as-is.
- [x] **P1-3**: `packages/platform/slack` created — `createSlackClient` (sync `WebClient` wrap), `exchangeOAuthCode` (raw `fetch` to `oauth.v2.access`), `buildSlackAuthorizeUrl`, `verifySlackSignature` (Phase 4 readiness, unit-tested against Slack's published HMAC vector). Token encrypt/decrypt is in the repository mappers, not in `@platform/slack`.
- [x] **P1-4**: `packages/domain/integrations` created — `SlackIntegration` entity (Zod), `SlackIntegrationRepository` port, `installSlackIntegrationUseCase` (handles same-org reinstall + cross-org conflict), `revokeSlackIntegrationUseCase` (soft-revoke only in Phase 1), in-memory test double exposed via `./testing` subpath export. `SlackIntegrationId` brand + schema added to `@domain/shared/id.ts`.
- [x] **P1-5**: Schemas `packages/platform/db-postgres/src/schema/integrations.ts` (parent) + `slack-integration-details.ts` (vendor-specific 1:1) + a single Drizzle migration that creates both. `SlackIntegrationRepositoryLive` joins them on read and writes both in one `SqlClient.transaction`; partial unique violation on `(kind, vendor_account_id)` translates to `SlackIntegrationConflictError` via `mapVendorAccountConflict`. Two CLI-only admin helpers (`findActiveSlackIntegrationByTeamIdAcrossOrgs`, `softRevokeSlackIntegrationAcrossOrgs`) query the parent table only.
- [x] **P1-6**: `SLACK_FLAG = "slack"` registered in `@domain/feature-flags/src/constants.ts`, exported from the package index. No callers wired yet — Phase 2 gates the UI, Phase 3 gates the producer.
- [x] **P1-7**: Tests across all three packages — OAuth fetch-mocked happy path + error mapping + incomplete-response detection; HMAC verification against Slack's published vector + tamper/replay/format negatives; in-memory use-case tests for fresh install, same-org reinstall (replaces), cross-org conflict; PGlite repository tests for encrypt/decrypt round-trip (verifies on-disk ciphertext ≠ plaintext), cross-org unique violation translation, soft-revoke idempotency, and the admin helpers. Total: 11 `@platform/slack` + 3 `@domain/integrations` + 6 `@platform/db-postgres` slack-integration tests. All green.
- [x] **P1-8**: Phase 1 is intentionally undocumented in `dev-docs/`. The spec captures the design; durable docs land in `dev-docs/slack-integration.md` once Phase 3 stabilizes (per the docs skill's "promote stable knowledge" guidance). `.agents/skills/slack-integration/SKILL.md` will follow if Phase 2/3 surface justifies it.
- [x] **P1-9** (added during implementation): CLI script `packages/platform/slack/scripts/slack-install.ts` exposed as `pnpm --filter @platform/slack slack:install`. Two modes: `--print-url` builds the authorize URL; `--code` exchanges + persists. `--force` soft-revokes a conflicting cross-org install first. Lives in `@platform/slack` per A6 decision; `@domain/integrations` + `@platform/db-postgres` are devDeps so the runtime package keeps a small dep graph.

**Exit gate**:

- A developer can run `pnpm --filter @platform/slack slack:install`, open the printed URL, approve in Slack, paste the redirect URL back, and watch a parent `integrations` row (kind=`slack`) + `slack_integration_details` row land with the bot token encrypted. The token round-trips cleanly through the repository (covered by the PGlite test).
- The `slack` flag is registered and off.
- No user-visible surface; no production code path enabled.

**Status**: complete. Migration applied locally; CLI smoke test landed an encrypted install for the `Latitude Team` workspace (`T03203W2SUC`) against the Acme seed org. Phase 2 unblocked.

### Phase 2 — Setup (OAuth install in the UI)

Goal: an org admin sees a "Connect Slack" button under settings (gated by the `slack` flag), can complete the OAuth flow, and sees the connected workspace name. The bot is installed and idle.

- [ ] **P2-1**: Settings page entry: `apps/web/src/routes/_authenticated/settings/integrations/slack/index.tsx`. Shows either "Connect Slack" or the connected workspace card (team name, installed-at, "Disconnect" button). Gated by `slack` flag.
- [ ] **P2-2**: OAuth start route at `apps/web/src/routes/integrations/slack/install.ts`: requires session, writes state to Redis (`org:${orgId}:slack:oauth-state:${state}`, TTL 10min), 302s to Slack's authorize URL.
- [ ] **P2-3**: OAuth callback route at `apps/web/src/routes/integrations/slack/oauth/callback.ts`: validates state, calls `exchangeOAuthCode` from `@platform/slack`, calls `installSlackIntegrationUseCase`, redirects to settings with a flash result.
- [ ] **P2-4**: Conflict handling: if the workspace's `team_id` already has a live integration under a different org → surface a clear error ("This Slack workspace is already connected to another Latitude organization"). No silent override.
- [ ] **P2-5**: Disconnect: settings "Disconnect" button calls `revokeSlackIntegrationUseCase` which sets `revoked_at`. Decision needed at implementation time: do we attempt `auth.revoke` on Slack to invalidate the token server-side, or only soft-revoke locally? Default to both (best-effort `auth.revoke`, always soft-revoke).
- [ ] **P2-6**: Staging Slack app set up (Public distribution flipped on, HTTPS endpoints registered); production app set up at Phase 3 release time. Wire `LAT_SLACK_CLIENT_ID` / `LAT_SLACK_CLIENT_SECRET` / `LAT_SLACK_SIGNING_SECRET` through `infra/lib/secrets.ts` for each environment (same `process.env.LAT_FOO ?? placeholder` pattern as `LAT_BETTER_AUTH_SECRET` / `LAT_STRIPE_*`) and into the ECS task definition in `infra/lib/ecs.ts`.
- [ ] **P2-7**: Tests — OAuth state validation, callback happy path, conflict path, disconnect.

**Exit gate**:

- Org admin in Acme can connect a Slack workspace and see it in settings.
- Reconnect replaces the previous row (or no-ops if same workspace).
- Disconnect soft-revokes and clears the UI.
- `slack` flag still off in production; staging users can enable it.

### Phase 3 — Notifications routing

Goal: org admin configures channels per notification group; firing a notification posts to the configured Slack channels.

- [ ] **P3-1**: Extend `OrganizationSettings` (`@domain/shared/src/settings.ts`) with the `slack.routes` sub-shape keyed by `NotificationGroup`. No migration (settings is already jsonb).
- [ ] **P3-2**: Use cases in `@domain/integrations`: `listSlackChannelsUseCase` (calls `conversations.list` via the bot token; paginated; filters archived), `configureSlackRouteUseCase`, `removeSlackRouteUseCase`. Channels for private/IM/MPIM channels are listed based on scopes (private requires the bot to be invited).
- [ ] **P3-3**: Settings UI: per `NotificationGroup` block, show a channel multi-select. Picker hits `listSlackChannelsUseCase` (cache via a TanStack collection with manual invalidation). Save persists to `organizations.settings.slack.routes[group]`.
- [ ] **P3-4**: New queue topic `notification-slack` with `send` task in `@domain/queue/src/topic-registry.ts`.
- [ ] **P3-5**: Per-kind Slack renderer registry at `packages/domain/integrations/src/templates/notifications/registry.ts`: exhaustive `Record<NotificationKind, SlackRenderer>`. Renderers return a Slack message (`text` + optional `blocks`).
- [ ] **P3-6**: Producer-step change in `apps/workers/src/workers/notifications.ts`: after the existing per-recipient fan-out, look up the org's active integration + routes for the group, publish one `notification-slack:send` per route. Skip if `slack` flag off or no live integration.
- [ ] **P3-7**: New worker `apps/workers/src/workers/notification-slack.ts`. Resolves the integration, decrypts the token, dispatches the per-kind renderer, calls `chat.postMessage` via `@platform/slack`. Handles `token_revoked` / `invalid_auth` by soft-revoking the integration. Handles 429 with `Retry-After` honoured by BullMQ backoff. Register in `apps/workers/src/server.ts`.
- [ ] **P3-8**: Idempotency decision: pick (a) `slack_deliveries(idempotency_key, channel_id)` claim-then-act table mirroring `notifications.emailed_at`, or (b) rely on BullMQ `dedupeKey` only. Document the decision in this spec when made.
- [ ] **P3-9**: Cascades: when an `integrations` row is soft-revoked, **leave routes in place** so re-connecting the same workspace restores delivery without re-picking channels. On `ProjectDeleted`: nothing to do (routes are org-only in v1).
- [ ] **P3-10**: Production rollout: enable the `slack` flag for opted-in orgs first; broader rollout after.
- [ ] **P3-11**: Promote durable knowledge: write `dev-docs/slack-integration.md`, extend `dev-docs/notifications.md` (Slack channel section already anticipates this), create `.agents/skills/slack-integration/SKILL.md` if surface justifies it.
- [ ] **P3-12**: Tests — producer fan-out with N routes, worker dispatch, renderer registry exhaustiveness, token-revoked → soft-revoke path, 429 backoff.

**Exit gate**:

- An incident in a project fires and lands in every channel routed for the org's `incidents` group, with content matching the email/in-app version.
- Disconnecting + reconnecting Slack restores delivery with the same routes.
- `dev-docs/slack-integration.md` exists and the spec is ready to be removed.

### Phase 4 — Mentions (deferred; not in initial scope)

Goal: org members `@latitude` in a channel and the bot does work and replies.

Not specified here in detail. The Phase 1–3 design is intentionally compatible: `app_mentions:read` is already in the scope set, the signing-secret env is already in place, the Slack app's event subscription URL is already configured.

Tasks at that point:

- [ ] **P4-1**: Subscribe to `app_mention` on the Slack app.
- [ ] **P4-2**: Add `slack-events` topic with `mention` task in `@domain/queue/src/topic-registry.ts`.
- [ ] **P4-3**: `apps/web/src/routes/api/slack/events.ts`: signature verification, replay rejection, `url_verification` handling, enqueue + 200 ack within 3s.
- [ ] **P4-4**: `apps/workers/src/workers/slack-events.ts`: chat logic + reply via bot token.
- [ ] **P4-5**: Update spec / docs.

**Exit gate**: deferred.

## Open questions to resolve at the relevant phase

These are tracked here so they don't get lost, but each can wait until the phase that actually needs them:

- **Phase 2**: should `revokeSlackIntegrationUseCase` call Slack's `auth.revoke` server-side, or only soft-revoke locally? (Recommendation: both, best-effort.)
- **Phase 3**: idempotency surface for Slack delivery — dedicated `slack_deliveries` table vs BullMQ `dedupeKey` only.
- **Phase 3**: when listing channels for the picker, do we surface private channels the bot isn't in (and let the admin invite the bot after picking), or hide them entirely? Slack API behaviour: `conversations.list` with `groups:read` only returns private channels the bot is already a member of.
- **Phase 3**: rate limit handling — `chat.postMessage` is tier 1 (~1/sec per channel). Confirm BullMQ retry/backoff config is appropriate (`Retry-After` honoured).
- **Phase 4**: how is `@latitude` scoped to an org? A Slack workspace is one Latitude org by v1 rule, but a workspace could host bot mentions from members who aren't Latitude members. Auth / authz semantics for the chat feature need their own design.
