# Slack integration

Multi-tenant Slack OAuth + notification routing. One Latitude organization ↔ one Slack workspace; notifications fan out to operator-configured channels per `NotificationGroup`.

## What ships in v1

- Per-org connect / disconnect flow under **Settings → Integrations** (`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/integrations.tsx`). Phase 2.
- Operator-configured channel routing per `NotificationGroup` (incidents, wrapped reports, custom messages). Phase 3.
- Worker fan-out: existing notification producers also publish `notification-slack:send` jobs per configured channel. The Slack worker renders + posts via `chat.postMessage`. Phase 3.

What is **not** in v1: token refresh on rotation (Phase 4) and `@latitude` bot mentions (Phase 5).

## Data model

Two tables, related 1:1, separated so the parent owns the lifecycle and the child holds Slack-specific shape.

```
latitude.integrations                   (parent — vendor-agnostic)
  id, organization_id, kind = "slack",
  vendor_account_id = slack team_id,
  installed_by_user_id, installed_at, revoked_at, …

latitude.slack_integration_details      (child — slack-specific)
  integration_id (PK), organization_id (denorm for RLS),
  team_name, app_id, bot_user_id,
  bot_access_token (encrypted), bot_token_scopes,
  refresh_token (encrypted, nullable), token_expires_at,
  routes jsonb DEFAULT '{}'             ← Phase 3 add
```

The cross-org claim ("one workspace, one Latitude org") is enforced by a partial unique index on `integrations(kind, vendor_account_id) WHERE revoked_at IS NULL`. Reinstall = soft-revoke the previous row + INSERT a new pair; the previous details row stays for audit. **Routes are NOT carried across reinstall** — the new active row begins with `routes = {}`.

### `routes` shape

```ts
type SlackRoute = { channelId: string; channelName: string }
type SlackRoutes = Partial<Record<NotificationGroup, SlackRoute[]>>
```

Updated per-group with `jsonb_set` so concurrent writes to different groups don't clobber each other. `channelName` is a best-effort label cached at configure-time; `channelId` is the source of truth.

### Idempotency ledger

```
latitude.slack_deliveries
  id, organization_id, integration_id,
  idempotency_key, channel_id,
  claimed_at, posted_at, message_ts
  UNIQUE (idempotency_key, channel_id)
```

The worker INSERTs ON CONFLICT DO NOTHING RETURNING. A losing claim short-circuits silently — duplicate posts in a Slack channel are louder than missed ones, so we err toward "drop on retry collision" rather than "retry might double-post". Rows with `posted_at IS NULL` are either in-flight or stranded by a worker crash; they intentionally do not retry.

## Pipeline

```
source domain event → domain-events worker
                    → notifications:request-<group>-notifications (producer)
                       ├──→ notifications:create-notification (per recipient, in-app + email)
                       └──→ notification-slack:send (per configured channel)
                                ↓
                    notification-slack:send worker
                       claim slack_deliveries → render via NOTIFICATION_SLACK_RENDERERS
                                              → chat.postMessage
                                              → markPosted(message_ts)
```

Three things make Slack different from email:

| Axis | Email / in-app | Slack |
| --- | --- | --- |
| Recipient model | Per-user (one row per recipient on `notifications`) | Per-channel — no recipient concept |
| Preference layer | `users.notification_preferences[group].email` | None. Slack is an org channel; opt-in is the integration itself + the route picker |
| Idempotency anchor | `notifications.emailed_at` flag on the per-recipient row | Dedicated `slack_deliveries` row keyed on `(idempotency_key, channel_id)` |
| Producer fan-out | One job per recipient | One job per `(occurrence, route)` |

The producer step lives in `apps/workers/src/workers/notifications.ts` (`fanOutSlackRoutes` helper) and runs in parallel with the existing per-recipient `create-notification` fan-out.

## Renderer registry

`packages/domain/integrations/src/templates/notifications/registry.ts` exports an exhaustive `Record<NotificationKind, SlackNotificationRenderer<K>>`. Adding a new `NotificationKind` to `NOTIFICATION_KIND_META` (in `@domain/notifications`) fails TS until a matching Slack renderer is added.

Renderer signature:

```ts
type SlackNotificationRenderer<K extends NotificationKind> = (
  payload: z.infer<(typeof NOTIFICATION_KIND_META)[K]["payload"]>,
  ctx: SlackRenderContext,
) => Effect.Effect<RenderedSlackMessage, RenderSlackError, never>
```

`R = never` for every kind today — payloads from the producer carry enough to render without extra repo lookups (in contrast to the email renderers, which fetch issue display names server-side).

Every renderer returns `{ text, blocks }`:
- `text` is the mobile push / a11y fallback and the message preview in Slack inbox views.
- `blocks` is the rich layout (`@slack/web-api`'s `KnownBlock[]`). Composed via small builders in `templates/notifications/blocks.ts` (header, section, fields, actions-link, context).

## Worker error policy

| Error | Tag | Action |
| --- | --- | --- |
| Token revoked, expired, invalid | `SlackMessengerError(auth)` | Ack (no retry). Phase 4 token refresh will recover this case. |
| Channel gone, bot kicked, archived | `SlackMessengerError(channel-gone)` | Ack. Route is orphaned; future UI work surfaces it. |
| Slack rate limit (429) | `SlackMessengerError(rate-limited)` | Propagate. BullMQ honours `Retry-After`. |
| Network / 5xx | `SlackMessengerError(transport)` | Propagate. BullMQ retries with backoff. |
| Render error (malformed payload, internal) | `RenderSlackError` | Ack — re-rendering won't help. Logged for triage. |
| Repository error | `RepositoryError` | Propagate. |

## Tokens + encryption

Bot tokens and refresh tokens live encrypted on `slack_integration_details` using AES-256-GCM with `LAT_MASTER_ENCRYPTION_KEY` (same scheme as `api-keys`). The repository encrypts on write and decrypts on read; nothing above the repository layer sees ciphertext.

Slack token rotation is on for every app (dev / staging / production). **Phase 3 does not yet handle refresh** — Phase 4 ships `getOrRefreshBotToken` + the `updateTokens` repo method. Until then, bot tokens are good for ~12h after install and the worker logs + skips on `token_expired`.

## Flag

`SLACK_FLAG = "slack"` from `@domain/feature-flags`. Off by default; the producer fan-out and the settings page both gate on it. Enable per-org for staged rollout.

## Operator runbook

- **Disconnect**: settings page → Disconnect button. Soft-revokes locally; best-effort `auth.revoke` to Slack with a 5s timeout. The disconnected integration's row is kept (for audit + the cross-org claim).
- **Reconnect**: re-runs the OAuth flow. **Routes are NOT preserved** — operator re-picks channels.
- **Private channels**: only appear in the picker if the bot is already a member. Invite the bot in Slack first, then click "Refresh channels" in the settings UI.

## File index

| Where | What |
| --- | --- |
| `packages/platform/slack` | SDK wrappers: `createSlackClient`, `exchangeOAuthCode`, `buildSlackAuthorizeUrl`, `verifySlackSignature`, `listAllConversations`, `postMessage`. Tagged errors map Slack-side failures to ack-vs-retry decisions in the worker. |
| `packages/domain/integrations` | Entities (`SlackIntegration`, `SlackRoute`, `SlackChannel`, `SlackDelivery`), ports (`SlackIntegrationRepository`, `SlackDeliveryRepository`), use cases (`install`/`revoke`/`list-channels`/`configure-route`/`remove-route`/`dispatch-notification`), Slack renderer registry. In-memory test doubles under `/testing`. |
| `packages/platform/db-postgres/src/schema/{slack-integration-details,slack-deliveries}.ts` | Schemas. |
| `packages/platform/db-postgres/src/repositories/{slack-integration,slack-delivery}-repository.ts` | Live adapters with RLS-scoped SQL. |
| `apps/web/src/routes/integrations/slack/*` | OAuth install + callback routes. |
| `apps/web/src/routes/_authenticated/projects/$projectSlug/settings/integrations.tsx` | Settings page (connect / disconnect / routes UI). |
| `apps/workers/src/workers/{notifications,notification-slack}.ts` | Producer fan-out + channel worker. |

## See also

- [specs/slack-integration.md](../specs/slack-integration.md) — full design + phase task list.
- [dev-docs/notifications.md](./notifications.md) — pipeline overview (Slack is the third channel after in-app + email).
