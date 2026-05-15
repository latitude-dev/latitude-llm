# Notifications

Multi-channel notification system. Producers fan out to channel-specific workers; each channel keeps its own renderer registry keyed on `NotificationKind`.

> Behind the `"notifications"` feature flag on the frontend bell. The backend writes rows and (depending on user prefs) sends emails regardless of the flag — gating happens on the read side so notification history isn't lost when the flag flips.

## Concepts

| Concept | Where | What it is |
| --- | --- | --- |
| **Kind** | `NOTIFICATION_KIND_META` in `@domain/notifications` | Flat enum identifying the event-type (`incident.opened`, `incident.closed`, `wrapped.report`, `custom.message`, ...). Each kind declares its group and its payload Zod schema. |
| **Group** | `NOTIFICATION_GROUPS` + `NOTIFICATION_GROUP_META` in `@domain/shared` | User-visible category. The preferences UI surfaces one toggle per group; adding a kind to an existing group inherits the user's setting automatically. |
| **Channel** | `apps/workers/src/workers/notification-*.ts` + per-channel registries | Delivery surface (in-app, email; Slack and others later). Each channel is one queue topic + one worker + one renderer registry keyed on `NotificationKind`. |
| **Idempotency key** | `idempotency_key` column on `notifications` | Producer-computed (`buildIdempotencyKey` in `@domain/notifications`). The unique index `(organization_id, user_id, idempotency_key)` absorbs at-least-once redelivery from the outbox + queue layers. |
| **Project anchor** | `project_id` column on `notifications` (nullable) | Cascade anchor for kinds tied to a project (`incident.*`, `wrapped.report`). On `ProjectDeleted` the domain-events worker fires `notifications:delete-by-project`, which removes every row anchored to the deleted project. Per the platform's no-FK rule, referential integrity is application-layer. |
| **Preferences** | `users.notification_preferences` (jsonb) | Per-user, per-group, per-channel switch (today only `email`). Missing entries default to opt-in (`true`). |

## Pipeline

```
Source domain event (IncidentCreated / IncidentClosed / WrappedReady / ...)
  → routed by apps/workers/src/workers/domain-events.ts
notifications:request-{incident,wrapped-report}-notifications
  → apps/workers/src/workers/notifications.ts
     – gate (incidents only): projectSettings.alertNotifications[kind]
     – resolveRecipients (today: all org members)
     – snapshot issue/project identity
     – publish N create-notification tasks
notifications:create-notification (one per recipient)
  → apps/workers/src/workers/notifications.ts
     – insertIfAbsent (ON CONFLICT DO NOTHING on the unique index)
     – if inserted AND shouldSendEmail(prefs, kind) → publish notification-email:send
notification-email:send
  → apps/workers/src/workers/notification-emailer.ts
     – markEmailed (UPDATE … WHERE emailed_at IS NULL, RETURNING id)
     – per-kind renderer from NOTIFICATION_EMAIL_RENDERERS
     – sendEmail via @platform/email-transport

ProjectDeleted (domain event, separate path)
  → apps/workers/src/workers/domain-events.ts
notifications:delete-by-project
  → apps/workers/src/workers/notifications.ts
     – DELETE FROM notifications WHERE organization_id = $1 AND project_id = $2
```

Per-channel **claim-then-act** ordering (stamp `emailed_at` before sending) guarantees zero duplicate emails under at-least-once redelivery, at the cost of dropping the email if SMTP fails mid-claim. Documented trade-off (per design discussion).

## Files

| File | Purpose |
| --- | --- |
| `packages/domain/notifications/src/entities/notification.ts` | `NotificationKind`, `NOTIFICATION_KIND_META`, per-kind payload schemas, `Notification` storage shape. |
| `packages/domain/notifications/src/entities/notification-preferences.ts` | `shouldSendEmail(prefs, kind)` helper. |
| `packages/domain/notifications/src/helpers/idempotency-key.ts` | `buildIdempotencyKey({ kind, payload })` — producer-side. |
| `packages/domain/notifications/src/use-cases/request-incident-notifications.ts` | Producer use case: gate + snapshots + recipients → list of `CreateNotification` requests. |
| `packages/domain/notifications/src/use-cases/request-wrapped-report-notifications.ts` | Same shape, no gate. |
| `packages/domain/notifications/src/use-cases/create-notification.ts` | Creator use case: idempotent insert + email-eligibility decision. |
| `packages/domain/notifications/src/use-cases/send-notification-email.ts` | Emailer use case: claim → render → send. Renderer + transport are injected. |
| `packages/domain/shared/src/notification-preferences.ts` | `NOTIFICATION_GROUPS`, `NOTIFICATION_GROUP_META`, `notificationPreferencesSchema`. Lives here (not `@domain/notifications`) so the `User` entity can carry it without a circular dep. |
| `packages/domain/queue/src/topic-registry.ts` | Queue topics + tasks: `notifications` (producer + creator), `notification-email`. |
| `packages/domain/email/src/templates/notifications/` | Per-kind email templates + `NOTIFICATION_EMAIL_RENDERERS` registry. |
| `packages/platform/db-postgres/src/schema/notifications.ts` | Drizzle schema for the `notifications` table. |
| `packages/platform/db-postgres/src/schema/better-auth.ts` | `users.notificationPreferences` jsonb column. |
| `apps/workers/src/workers/domain-events.ts` | Routes source events to `request-*` tasks. |
| `apps/workers/src/workers/notifications.ts` | Consumes `request-*` + `create-notification`. |
| `apps/workers/src/workers/notification-emailer.ts` | Consumes `notification-email:send`. |
| `apps/web/src/routes/_authenticated/-components/notifications/` | Bell + feed + per-kind renderers. |
| `apps/web/src/routes/_authenticated/settings/account.tsx` | "Email notifications" section with per-group toggles. |

## Adding a new kind

1. Add an entry to `NOTIFICATION_KIND_META` (kind name + group + payload Zod schema).
2. Add the corresponding payload schema export and helper types in `entities/notification.ts`.
3. Extend `buildIdempotencyKey` with the new kind's anchor. For one-off kinds with no natural source, fall back to `${kind}:${generateId()}`.
4. Add per-channel renderers:
   - In-app: `apps/web/src/routes/_authenticated/-components/notifications/renderers/` and update the `RENDERERS` dispatch in `notification-item.tsx`.
   - Email: `packages/domain/email/src/templates/notifications/<kind>/index.tsx` and add to `NOTIFICATION_EMAIL_RENDERERS`. The exhaustive `Record<NotificationKind, ...>` shape forces a TS error until done.
5. If the kind has a non-existing source path, publish a new `request-<kind>-notifications` task in the right producer (domain-events handler, the wrapped worker, etc.) and add a consumer handler in `notifications.ts` that calls a new `requestXxxNotifications` use case.

If the new kind belongs to an **existing** group, no settings UI change is needed — the user's group toggle automatically covers it. New groups need an entry in `NOTIFICATION_GROUPS` + `NOTIFICATION_GROUP_META`.

## Adding a new channel (Slack, SMS, ...)

1. New queue topic in `topic-registry.ts` (e.g. `notification-slack` with a `send` task).
2. New per-kind renderer registry next to the channel adapter (e.g. `@platform/slack/templates/notifications/registry.ts`).
3. Extend `ChannelPreferences` in `@domain/shared/notification-preferences.ts` with the new key (jsonb — no migration).
4. Update the creator step in `apps/workers/src/workers/notifications.ts` to publish `notification-slack:send` when `prefs[group].slack` is true.
5. New worker file mirroring `notification-emailer.ts`. Register in `apps/workers/src/server.ts`.

Source events, the producer step, the in-app feed, and the kind registry are all unchanged.

## Defaults

| Setting | Default | Reason |
| --- | --- | --- |
| User's `notification_preferences` | `null` (treated as "all groups: email on") | Opt-out matches the in-app default of "all org members get every notification." |
| Project's `alertNotifications[kind]` | unset (treated as enabled) | Existing behaviour; only relevant for incidents. |

## Idempotency under outbox redelivery

The outbox publishes to the queue **before** marking events as published; a crash between publish and commit causes the next poll to re-publish. The queue is similarly at-least-once: a consumer that crashes pre-ack sees the message again on retry.

Each step in the pipeline is therefore idempotent:

- **Producer step**: stateless; deterministic `dedupeKey` on each `pub.publish` lets the queue layer drop duplicate emits.
- **Creator step**: unique index makes the insert a no-op; the `RETURNING` clause tells us whether we wrote the row. The email-publish branch only fires for the "wrote it" case.
- **Emailer step**: `markEmailed` is a conditional UPDATE; the first runner wins the claim. Subsequent runners exit silently. SMTP failure post-claim means a lost email (acceptable per design — preferred over duplicates).

## See also

- Design spec: `specs/notifications-multi-channel.md` (decisions, trade-offs, out-of-scope).
- Skill: `.agents/skills/async-jobs-and-events/SKILL.md` for general queue/worker conventions.
