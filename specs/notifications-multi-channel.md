# Multi-channel notifications

## Context

The in-app notification system shipped behind the `"notifications"` feature flag with no real users on it, so the data model could be reshaped freely. The system is now extended to **email** delivery, with **Slack** (and other channels) as a planned next step.

The old shape (`type=incident` + nested `payload.event` discriminator, `source_id` for idempotency, alert-notifications setting only applied to incidents) didn't generalise: it conflated event kinds inside a single `type` value, scattered idempotency across two columns + a JSON path, and had no user-facing preferences surface.

## Goals

- A flat notion of "kind" that routes and renders independently per event-type (`incident.opened`, `incident.closed`, `wrapped.report`, `custom.message`, ...).
- A small set of user-visible **groups** so the preferences UI stays stable when new kinds are added inside an existing group.
- Per-user email preferences (opt-out) without locking us in: the same shape supports Slack and other channels later.
- A pipeline where adding a new channel = adding one queue + worker + renderer registry, with zero changes to producers.
- Idempotency owned by a single column, computed by the producer.

## Decisions

- **`idempotency_key`** (not `key`, not `dedupe_key`) is the column name. It's the industry-standard term (Stripe, queue libs) and reads unambiguously alongside Drizzle's primary/foreign keys.
- **Email preference default**: `true` when missing. Opt-out model — a brand-new user with `notification_preferences = null` gets emails for every group.
- **Migration approach**: drop + recreate the `notifications` table. No real users on the feature flag, so preserving rows is unnecessary.
- **Per-channel preferences surface**: `email` only. In-app is the feed itself; no opt-out per kind. The jsonb shape supports adding more channel keys later without a migration.
- **Audience scope**: unchanged — all org members. Per-(user, project, kind) subscriptions remain a future seam in `resolveRecipients`.

## Architecture

```
Source domain event (IncidentCreated / IncidentClosed / WrappedReady / AdminBroadcast)
    │
    ▼  routed by `apps/workers/src/workers/domain-events.ts`
notifications:request-{incident,wrapped-report}-notifications
    │
    ▼  consumed by `apps/workers/src/workers/notifications.ts`
    │   — applies project-level alert-kind gate (incidents)
    │   — snapshots issue + project identity
    │   — resolves recipients (today: all org members)
    │   — publishes N `create-notification` tasks
    ▼
notifications:create-notification (one per recipient)
    │
    ▼  consumed by `apps/workers/src/workers/notifications.ts`
    │   — INSERT INTO notifications ... ON CONFLICT (org, user, idempotency_key) DO NOTHING
    │   — if a row was inserted AND user prefs allow email for the kind's group,
    │     publishes `notification-email:send`
    ▼
notification-email:send
    │
    ▼  consumed by `apps/workers/src/workers/notification-emailer.ts`
    │   — claims via `markEmailed` (UPDATE ... WHERE emailed_at IS NULL)
    │   — renders via per-kind template registry in `@domain/email`
    │   — sends through the existing `@platform/email-transport`
```

### Idempotency at every layer

The outbox + queue infrastructure is at-least-once: any consumer can run more than once per source event. Each step's idempotency is explicit:

- **Producer step**: stateless except for the `pub.publish` calls. Each call has a deterministic `dedupeKey` so the queue layer drops duplicate emits.
- **Creator step**: the unique index `(organization_id, user_id, idempotency_key)` makes the insert a no-op on re-delivery; `RETURNING` distinguishes "we wrote it" from "row already existed". The email-publish branch only fires when we wrote it.
- **Emailer step**: `markEmailed` is a conditional UPDATE on `emailed_at IS NULL`. The first runner wins the claim and proceeds to render + send; subsequent runners exit silently. Trade-off (per design): if SMTP fails after we've stamped, the user never gets that notification by email — preferred over duplicate sends.

### Kind registry

`packages/domain/notifications/src/entities/notification.ts` is the single source of truth:

```ts
export const NOTIFICATION_KIND_META = {
  "incident.opened": { group: "incidents",       payload: incidentOpenedPayloadSchema },
  "incident.closed": { group: "incidents",       payload: incidentClosedPayloadSchema },
  "wrapped.report":  { group: "wrapped_reports", payload: wrappedReportPayloadSchema },
  "custom.message":  { group: "custom_messages", payload: customMessagePayloadSchema },
} as const satisfies Record<string, { group: NotificationGroup; payload: z.ZodTypeAny }>
```

Each channel keeps its own renderer registry keyed on `NotificationKind`, with the `Record<NotificationKind, Renderer>` type forcing TS errors when a new kind is added without a matching renderer:

- **In-app** (frontend): `apps/web/src/routes/_authenticated/-components/notifications/notification-item.tsx` dispatch.
- **Email**: `packages/domain/email/src/templates/notifications/registry.ts`.

### Groups + preferences

`NOTIFICATION_GROUPS` + `NOTIFICATION_GROUP_META` + `notificationPreferencesSchema` live in `@domain/shared` (not `@domain/notifications`), so the `User` entity can carry typed `notificationPreferences` without introducing a circular dep on `@domain/notifications`.

`shouldSendEmail(prefs, kind)` lives in `@domain/notifications` and resolves through `groupOf(kind)`. Missing entries return `true` (opt-out).

The settings UI at `/settings/account` renders one switch per group (label/description from `NOTIFICATION_GROUP_META`); adding a kind to an existing group automatically inherits the user's current setting.

### Project cascade

Kinds tied to a project (`incident.*`, `wrapped.report`) carry the project id in a top-level `project_id` column (not just the payload — the payload field is for renderers). When the project is deleted:

- `apps/web/src/domains/projects/projects.functions.ts` writes a `ProjectDeleted` event to the outbox.
- The `domain-events` worker routes it to `notifications:delete-by-project`.
- The notifications worker calls `deleteNotificationsByProjectUseCase`, which deletes every row with that `project_id` in the current org.

No FK constraint (per the codebase's no-FK rule); the partial index `(organization_id, project_id) WHERE project_id IS NOT NULL` keeps the cleanup query cheap. `custom.message` and other project-less kinds have `project_id = NULL` and are unaffected.

### Idempotency keys

`buildIdempotencyKey({ kind, payload })` in `@domain/notifications/helpers/idempotency-key.ts` computes:

- `incident.opened:<alertIncidentId>` / `incident.closed:<alertIncidentId>` — fresh incident rows mean a re-escalation of the same issue produces a new key.
- `wrapped.report:<wrappedReportId>` — one wrapped report = one notification.
- `custom.message:<generatedId>` — every custom message is unique by intent (no dedupe).

## Schema

```sql
CREATE TABLE latitude.notifications (
  id              varchar(24) PRIMARY KEY,
  organization_id varchar(24) NOT NULL,
  user_id         varchar(24) NOT NULL,
  kind            varchar(64) NOT NULL,        -- NotificationKind
  idempotency_key text        NOT NULL,        -- producer-computed
  project_id      varchar(24),                 -- cascade anchor; null for project-less kinds
  payload         jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  seen_at         timestamptz,
  emailed_at      timestamptz                  -- stamped by the email channel
);

CREATE INDEX notifications_user_org_recent_idx
  ON latitude.notifications (user_id, organization_id, created_at DESC, id DESC);

CREATE INDEX notifications_user_org_unread_idx
  ON latitude.notifications (user_id, organization_id) WHERE seen_at IS NULL;

CREATE UNIQUE INDEX notifications_idempotency_uq
  ON latitude.notifications (organization_id, user_id, idempotency_key);

CREATE INDEX notifications_org_project_idx
  ON latitude.notifications (organization_id, project_id) WHERE project_id IS NOT NULL;
```

```sql
ALTER TABLE latitude.users ADD COLUMN notification_preferences jsonb;
-- Shape: { [group]: { email?: boolean } } — see notificationPreferencesSchema.
```

## Adding a new channel (Slack)

1. Add a new queue topic `notification-slack` with a `send` task in `packages/domain/queue/src/topic-registry.ts`.
2. Add per-kind Slack templates + an exhaustive registry in `@platform/slack/templates/notifications/` (or wherever Slack ends up living).
3. Add a `slack` field to `ChannelPreferences` in `@domain/shared/notification-preferences.ts` — no migration (jsonb).
4. Extend the creator step (`apps/workers/src/workers/notifications.ts`) to also publish `notification-slack:send` when the user's `prefs[group].slack` is true.
5. Add a new worker file `notification-slack.ts` mirroring `notification-emailer.ts`. Register it in `apps/workers/src/server.ts`.

Source events, the producer step, and the in-app feed don't change.

## Adding a new kind

1. Add an entry to `NOTIFICATION_KIND_META` with its group and Zod payload schema.
2. Add a matching entry to **every** channel's renderer registry — TypeScript will fail the build until each is in place.
3. Extend `buildIdempotencyKey` if the kind has a natural anchor; otherwise fall back to `${kind}:${generateId()}` for always-unique semantics.
4. If the source event lives in another bounded context (not incidents / wrapped), publish a new `request-<kind>-notifications` queue task and wire its consumer to call `requestNotifications` with the new kind.

The user-facing preferences surface stays stable — a new kind under an existing group inherits the toggle.

## Out of scope

- Slack channel implementation (the architecture supports it; not in this PR).
- In-app opt-out per group (today, the bell shows everything).
- Per-(user, project, kind) subscription filtering (`resolveRecipients` seam preserved).
- Email digesting / batching (one email per notification, real-time).
- Bypass-preferences flag for "must-deliver" kinds.
- React Email polish for the per-kind templates (skeletons land first; a follow-up replaces them with `@react-email/components`-based layouts matching the rest of the email surface).
- Deduping the `wrapped.report` notification email with the existing rich Wrapped email sent directly from `apps/workers/src/workers/wrapped.ts`. For now, recipients with `wrapped_reports.email = true` get both. Follow-up will consolidate.
