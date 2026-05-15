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
| **User preferences** | `users.notification_preferences` (jsonb) | Per-user, per-group, per-channel switch (today only `email`). Missing entries default to opt-in (`true`). |
| **Project-level gate** | `projects.settings.notifications.<group>` (jsonb) | Project-level "should this notification be requested at all" decision. For incidents the leaf is per-`AlertIncidentKind`; other groups get whatever shape is useful at the project level. |

## Pipeline

```
Source domain event (IncidentCreated / IncidentClosed / WrappedReady / ...)
  → routed by apps/workers/src/workers/domain-events.ts
notifications:request-{incident,wrapped-report}-notifications
  → apps/workers/src/workers/notifications.ts
     – gate (incidents only): projectSettings.notifications.incidents[alertKind]
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
| `packages/domain/notifications/src/use-cases/delete-notifications-by-project.ts` | Cascade cleanup on `ProjectDeleted`. |
| `packages/domain/shared/src/notification-preferences.ts` | `NOTIFICATION_GROUPS`, `NOTIFICATION_GROUP_META`, `notificationPreferencesSchema`. Lives here (not `@domain/notifications`) so the `User` entity can carry it without a circular dep. |
| `packages/domain/shared/src/settings.ts` | `projectSettingsSchema` — including `notifications.incidents` (project-level gate) and `escalation.sensitivity` (detector knob). |
| `packages/domain/queue/src/topic-registry.ts` | Queue topics + tasks: `notifications` (producer + creator + delete-by-project), `notification-email`. |
| `packages/domain/email/src/templates/notifications/` | Per-kind email templates + `NOTIFICATION_EMAIL_RENDERERS` registry. |
| `packages/platform/db-postgres/src/schema/notifications.ts` | Drizzle schema for the `notifications` table. |
| `packages/platform/db-postgres/src/schema/better-auth.ts` | `users.notificationPreferences` jsonb column. |
| `apps/workers/src/workers/domain-events.ts` | Routes source events to `request-*` / `delete-by-project` tasks. |
| `apps/workers/src/workers/notifications.ts` | Consumes `request-*` + `create-notification` + `delete-by-project`. |
| `apps/workers/src/workers/notification-emailer.ts` | Consumes `notification-email:send`. |
| `apps/web/src/routes/_authenticated/-components/notifications/` | Bell + feed + per-kind renderers. |
| `apps/web/src/routes/_authenticated/settings/account.tsx` | "Email notifications" section with per-group toggles. |
| `apps/web/src/routes/_authenticated/projects/$projectSlug/settings.tsx` | Project-level incident-kind toggles + escalation sensitivity. |

## Naming conventions

- **Kind**: `<source>.<event>` style. Examples: `incident.opened`, `incident.closed`, `wrapped.report`, `custom.message`. Keep it lowercase and dot-separated. The first segment names the source aggregate or domain area; the second names what happened or what kind of thing it is.
- **Group**: lowercase plural noun (`incidents`, `wrapped_reports`, `custom_messages`). Group keys are user-visible (the settings page label comes from `NOTIFICATION_GROUP_META`), but the keys themselves should be stable since they're persisted in `users.notification_preferences` jsonb.
- **Queue task** for a new source: `request-<group>-notifications` (e.g. `request-incident-notifications`). Mirrors the existing pattern.
- **Idempotency key**: `${kind}:${naturalEntityId}` when there is a natural source entity, or `${kind}:${generatedId}` when every event is unique by intent (custom messages).

## Adding a new kind

For an existing group:

1. **Add the kind** to `NOTIFICATION_KIND_META` in `packages/domain/notifications/src/entities/notification.ts`:
   ```ts
   "incident.escalation-ended": { group: "incidents", payload: incidentEscalationEndedPayloadSchema },
   ```
2. **Define the payload schema** in the same file (sibling of `incidentOpenedPayloadSchema`). Export both the schema and the inferred type.
3. **Extend `buildIdempotencyKey`** in `packages/domain/notifications/src/helpers/idempotency-key.ts` if the new kind has a natural anchor:
   ```ts
   case "incident.escalation-ended":
     return `${input.kind}:${input.payload.alertIncidentId}`
   ```
4. **Add per-channel renderers** — the exhaustive `Record<NotificationKind, ...>` shape forces TS errors until each is in place:
   - **In-app**: `apps/web/src/routes/_authenticated/-components/notifications/renderers/<kind>.tsx` and the dispatch in `notification-item.tsx`.
   - **Email**: `packages/domain/email/src/templates/notifications/<kind>/index.tsx` and the entry in `NOTIFICATION_EMAIL_RENDERERS` (`registry.ts`).
5. **Producer**: if the new kind has a source event flow:
   - Add a new task to the `notifications` queue topic (`request-<kind>-notifications`) in `packages/domain/queue/src/topic-registry.ts` if no existing producer fits.
   - Write a new `requestXxxNotificationsUseCase` in `@domain/notifications` that returns one request per recipient.
   - Wire the source event in `apps/workers/src/workers/domain-events.ts` to publish the new task.
   - Add a handler for the new task in `apps/workers/src/workers/notifications.ts`.
   - If the kind is tied to a project, set `projectId` on each request so the cascade on `ProjectDeleted` cleans it up.
6. **Tests**: alongside each new use case + the renderer registries.

The user-facing preferences UI does **not** need changing — the new kind inherits the group's existing toggle.

## Adding a new group

A new group is a new user-visible category. Adding one requires schema edits at the `@domain/shared` level (the user's prefs jsonb is keyed on group names) and a fresh slot in the project-settings schema if the group has a project-level dimension.

1. **Add the group** to `NOTIFICATION_GROUPS` and `NOTIFICATION_GROUP_META` in `packages/domain/shared/src/notification-preferences.ts`:
   ```ts
   export const NOTIFICATION_GROUPS = ["incidents", "wrapped_reports", "custom_messages", "deployments"] as const
   
   export const NOTIFICATION_GROUP_META: Record<NotificationGroup, { label: string; description: string }> = {
     ...
     deployments: { label: "Deployments", description: "Notifications when a project's models or evaluations are promoted to production." },
   }
   ```
   `notificationPreferencesSchema` is **built from `NOTIFICATION_GROUPS`** — the schema auto-extends. No separate schema edit needed.
2. **User preferences UI** at `apps/web/src/routes/_authenticated/settings/account.tsx` iterates `NOTIFICATION_GROUPS` to render one toggle per group, so the new group **shows up automatically** with its label/description from `NOTIFICATION_GROUP_META`. Verify visually after building.
3. **Add at least one kind** to the new group via the "Adding a new kind" steps above. A group with no kinds is dead code.
4. **Project-level gate (optional)** — only needed if the new group should be opt-out-able at the project level (like incidents are today):
   - Add a slot to `notificationsSettingSchema` in `packages/domain/shared/src/settings.ts`:
     ```ts
     export const notificationsSettingSchema = z.object({
       incidents: incidentNotificationsSettingSchema.optional(),
       deployments: deploymentNotificationsSettingSchema.optional(),  // new
     })
     ```
   - Define `deploymentNotificationsSettingSchema` with whatever inner shape is useful at the project level (per-kind, per-target-env, single boolean, etc.). The leaf granularity differs per group based on what users want to dial.
   - Add a project-level helper next to `isIncidentNotificationEnabled` (e.g. `isDeploymentNotificationEnabled`) that reads `settings?.notifications?.deployments?.<leaf> ?? true`.
   - Apply the gate in the matching `requestXxxNotificationsUseCase` before fan-out.
   - Update the API schema in `apps/api/src/routes/projects.ts` to surface the new sub-shape (`DeploymentNotificationsSettingSchema`, etc.). Regenerate `openapi.json` + `mcp.json` via `pnpm --filter @app/api openapi:emit` + `mcp:emit`.
   - Wire the new toggles into `apps/web/src/routes/_authenticated/projects/$projectSlug/settings.tsx`.
5. **Tests**:
   - Update `request-incident-notifications.test.ts`-style suites for the new group's producer.
   - Cover the "user opted-out of group X still gets group Y" cross-group preference test.

Defaults follow the opt-out model: missing entries → `true` (email on). If a group should default to off for some reason, encode it in `NOTIFICATION_GROUP_META[group].defaultEmail: boolean` and have `shouldSendEmail` fall back to it (today there's no such field — add it then).

## Adding a new channel (Slack, SMS, ...)

1. **New queue topic** in `packages/domain/queue/src/topic-registry.ts` (e.g. `notification-slack` with a `send` task).
2. **New per-kind renderer registry** next to the channel adapter (e.g. `@platform/slack/templates/notifications/registry.ts`) keyed on `NotificationKind`.
3. **Extend `ChannelPreferences`** in `packages/domain/shared/src/notification-preferences.ts` with the new key (jsonb — no migration):
   ```ts
   export const channelPreferencesSchema = z.object({
     email: z.boolean().optional(),
     slack: z.boolean().optional(),  // new
   })
   ```
4. **Update the creator step** in `apps/workers/src/workers/notifications.ts` to also publish `notification-slack:send` when `prefs[group].slack` is true. Add a `shouldSendSlack(prefs, kind)` helper alongside `shouldSendEmail` if it gets non-trivial.
5. **New worker file** mirroring `notification-emailer.ts`. Register it in `apps/workers/src/server.ts`.
6. **Settings UI** at `apps/web/src/routes/_authenticated/settings/account.tsx` extends the per-group block to show one switch per channel (today it shows just the email switch).

Source events, the producer step, the in-app feed, and the kind registry are all unchanged.

## Project anchor

Set `projectId` on the `CreateNotificationRequest` for any kind tied to a project. This populates the `notifications.project_id` column, which is what the `ProjectDeleted` cascade reads.

- For incidents: the `requestIncidentNotificationsUseCase` reads `incident.projectId` and threads it through.
- For wrapped reports: the wrapped worker passes `payload.projectId` in the `request-wrapped-report-notifications` queue task; the use case threads it through.
- For project-less kinds (`custom.message`, future cross-project announcements): set `projectId: null`. The cascade ignores those rows.

No FK constraint on `project_id` (per the database-postgres skill's no-FK rule). The partial index `notifications_org_project_idx` on `(organization_id, project_id) WHERE project_id IS NOT NULL` keeps the cascade query cheap.

## Defaults

| Setting | Default | Reason |
| --- | --- | --- |
| User's `notification_preferences` | `null` (treated as "all groups: email on") | Opt-out matches the in-app default of "all org members get every notification." |
| Project's `notifications.incidents[alertKind]` | unset (treated as enabled) | Per-alert-kind project-level opt-out. Lives in `projects.settings`; sibling of `escalation.sensitivity` (which is the detector knob, not a notification toggle). |

## Idempotency under outbox redelivery

The outbox publishes to the queue **before** marking events as published; a crash between publish and commit causes the next poll to re-publish. The queue is similarly at-least-once: a consumer that crashes pre-ack sees the message again on retry.

Each step in the pipeline is therefore idempotent:

- **Producer step**: stateless; deterministic `dedupeKey` on each `pub.publish` lets the queue layer drop duplicate emits.
- **Creator step**: unique index makes the insert a no-op; the `RETURNING` clause tells us whether we wrote the row. The email-publish branch only fires for the "wrote it" case.
- **Emailer step**: `markEmailed` is a conditional UPDATE; the first runner wins the claim. Subsequent runners exit silently. SMTP failure post-claim means a lost email (acceptable per design — preferred over duplicates).
- **Delete-by-project**: `DELETE ... RETURNING id` is naturally idempotent; re-runs delete zero rows.

## Anti-patterns

- **Don't gate inside the renderer.** The producer/creator decides whether to send; once the row is written + the email task is published, the channel worker just renders and delivers. Filtering at the renderer is a smell.
- **Don't put routing info in the kind name.** `incident.opened` describes what happened, not who needs to know. Recipient resolution and channel selection live in the producer/creator step.
- **Don't read user prefs in the producer step.** Prefs are per-channel and live with the channel decision; the producer step doesn't know about channels.
- **Don't dedupe by source entity id alone.** `notifications.idempotency_key` is per-occurrence — multiple incidents on the same issue must produce multiple notifications. `buildIdempotencyKey` is the single place that enforces this.
- **Don't add an FK constraint on `project_id`.** Per the database-postgres skill; use the application-layer cascade via `ProjectDeleted` → `delete-by-project`.

## See also

- Design spec: `specs/notifications-multi-channel.md` (decisions, trade-offs, out-of-scope, full architecture).
- Skill: `.agents/skills/notifications/SKILL.md` for agent-facing instructions.
- Skill: `.agents/skills/async-jobs-and-events/SKILL.md` for general queue/worker conventions.
- Skill: `.agents/skills/database-postgres/SKILL.md` for the no-FK rule + Drizzle conventions.
