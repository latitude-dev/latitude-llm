# Notifications

Multi-channel notification system. Producers fan out to channel-specific workers; each channel keeps its own renderer registry keyed on `NotificationKind`.

> Two independent feature flags gate this system:
> - **`"notifications"`** — frontend bell + in-app feed visibility. The backend writes rows regardless, so flipping the flag doesn't lose notification history.
> - **`"email-notifications"`** — org-level kill switch for the email channel. Checked in the notifications worker's creator step (`apps/workers/src/workers/notifications.ts`) before publishing `notification-email:send`. Also gates the user-prefs settings UI (the "Email notifications" section is hidden when off). When off, in-app rows still land in the bell; only email is suppressed.

## Concepts

| Concept | Where | What it is |
| --- | --- | --- |
| **Kind** | `NOTIFICATION_KIND_META` in `@domain/notifications` | Flat enum identifying the event-type (`incident.event`, `incident.opened`, `incident.closed`, `wrapped.report`, `custom.message`, ...). Each kind declares its group and its payload Zod schema. Incidents fan out across three kinds reflecting the alerts lifecycle: `incident.event` for one-shot kinds (issue.new, issue.regressed — `endedAt = startedAt`), `incident.opened` and `incident.closed` for sustained kinds (issue.escalating). |
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
     (incidents: forwards a transition hint — "created" / "closed" —
      not a hardcoded notification kind)
notifications:request-{incident,wrapped-report}-notifications
  → apps/workers/src/workers/notifications.ts
     – incidents: derive kind from incident.endedAt
       (endedAt = startedAt → incident.event;
        endedAt IS NULL     → incident.opened;
        endedAt > startedAt → incident.closed)
     – gate (incidents only): projectSettings.notifications.incidents[alertKind]
     – resolveRecipients (today: all org members)
     – snapshot trend window (sustained kinds: 3h ending at the
       transition, 18 buckets × 10min, both occurrence counts and
       per-bucket escalation thresholds via ScoreAnalyticsRepository)
     – publish N create-notification tasks
notifications:create-notification (one per recipient)
  → apps/workers/src/workers/notifications.ts
     – insertIfAbsent (ON CONFLICT DO NOTHING on the unique index)
     – if inserted AND shouldSendEmail(prefs, kind) → publish notification-email:send
notification-email:send
  → apps/workers/src/workers/notification-emailer.ts
     – markEmailed (UPDATE … WHERE emailed_at IS NULL, RETURNING id)
     – per-kind renderer Effect from NOTIFICATION_EMAIL_RENDERERS
       (yields whatever services it needs — wrapped.report fetches the
        wrapped_reports row via WrappedReportRepository; payload-only
        kinds yield nothing)
     – sendEmail via @platform/email-transport

ProjectDeleted (domain event, separate path)
  → apps/workers/src/workers/domain-events.ts
notifications:delete-by-project
  → apps/workers/src/workers/notifications.ts
     – DELETE FROM notifications WHERE organization_id = $1 AND project_id = $2
```

Per-channel **claim-then-act** ordering (stamp `emailed_at` before sending) guarantees zero duplicate emails under at-least-once redelivery, at the cost of dropping the email if SMTP fails mid-claim. Documented trade-off (per design discussion).

## Incident email payloads + chart

Sustained-incident emails (`incident.opened` / `incident.closed`) embed a server-rendered trend chart sized so recipients can triage from inbox without clicking through. All incident payloads carry a generic source base (`sourceType`, `sourceId`, `incidentKind`, `severity`) plus per-kind extras:

| Field | Where it lives | Snapshotted on |
| --- | --- | --- |
| `trend.points` | Sustained kinds | `incident.opened`, `incident.closed` — 3h × 10-min buckets (18 points) ending at the transition timestamp. Each point has `{ t, count, threshold \| null }`. |
| `tags` | Top-5 alphabetical | `incident.event`, `incident.opened`. From `ScoreAnalyticsRepository.aggregateTagsByIssues` with a 30-day lookback. Closed skips — the email focuses on recovery. |
| `sampleExcerpt` | One-shot triage card | `incident.event` and `incident.opened`. Prefers latest annotation `rawFeedback`; falls back to latest evaluation `feedback`. Capped at 200 chars; `truncated: true` when cropped. Carries an `author` discriminated union — `{ kind: "user", name, imageUrl }` (human annotation), `{ kind: "system" }` (Latitude-authored, i.e. `annotatorId IS NULL`), or `{ kind: "evaluation", name }` (eval fallback). The producer snapshots attribution at notification time via `UserRepository`/`EvaluationRepository`, so the email renders without further lookups. Closed kind skips — the recovery email focuses on the descent, not the source. |
| `breach { triggerRate, baselineRate, threshold }` | Per-hour rates | `incident.opened` only, when the alert incident has `entrySignals`. `baselineRate` = `expected1h`, `threshold` = `entryThreshold1h`, `triggerRate` is derived from the peak trend bucket converted to per-hour. Omitted on legacy incidents missing `entrySignals`. |
| `recovery.durationMs` | `endedAt - startedAt` | `incident.closed` only. Drives the "elevated for X" copy in the email. |

### Email layout

The three incident emails follow a Sentry-style sectioned shape so recipients can scan section labels and drill into the part that matters:

1. **Heading + subtitle** — alert-type heading (`New issue` / `Regressed issue` / `Escalating issue` / `Resolved escalation`) and an audience subtitle that explains who got the email and why.
2. **`ISSUE` section** — issue name, description (when set on the entity), `{absolute timestamp}   ID: …{shortId}` row, then a 2-column metadata table with Project (`{orgName} / {projectName}`), Severity badge, and Tags chips when present.
3. **Per-kind section** — `BREACH` (opened, with breach copy + chart), `RECOVERY` (closed, with elapsed-time copy + chart), or the **sample-excerpt card** (event/opened, no eyebrow — a "From an annotation:" / "From an evaluation:" label outside the card, then an in-app-style author row (avatar + name, or Latitude monogram + "Agent" badge, or just the evaluation name) followed by the quoted feedback text).
4. **View issue CTA** at the bottom.

Shared building blocks live in `packages/domain/email/src/templates/notifications/-incident-components.tsx`: `SectionHeader`, `EmailMetadataTable`, `SeverityBadge`, `TagsChips`, `TimestampIdRow`, `IncidentTrendChartImage`, `SampleExcerptCard`, plus the `formatRatePerHour` / `humanizeDurationMs` / `formatScope` helpers. Renderers consume `ctx.notificationCreatedAt` and `ctx.organization` (threaded through the send-notification-email use case) for the timestamp + "Acme / project-name" scope line.

Subject lines: no `[Latitude]` prefix. The alert-type prefix (`New issue:`, `Escalating:`, `Resolved: escalation on …`) is the actual inbox-skim signal.

### Server-rendered trend chart

The chart embedded in sustained-incident emails is rendered server-side:

- **Route:** `GET /api/notifications/<notificationId>/incident-trend.png` in `apps/web` — TanStack Start file route at `apps/web/src/routes/api/notifications/$nid/incident-trend[.]png.ts`. The `[.]` bracket-escape preserves the literal `.png` extension in the URL (TSR's file routing otherwise treats `.` as a path separator; same mechanism the repo already uses for `[.well-known]/...`). The `/api/` prefix matches the project's convention for machine-facing routes in `apps/web` (`api/health.ts`, `api/auth/…`); reuses the satori + resvg pipeline already running for the wrapped OG card. Keeping this in `apps/web` keeps `apps/api` strictly to the authenticated public + MCP surface. Unauthenticated — the route reads the row by `notificationId` and renders. The CUID (~128 bits of entropy) is the lookup key; enumeration isn't feasible at that key size.
- **Rendering:** `satori` builds a 600×200 SVG from the snapshotted `trend.points` (bars for `count`, dashed per-bucket curve for `threshold`, peak bucket emphasised, optional baseline reference line when the payload has `breach`). `@resvg/resvg-js` rasterises to PNG.
- **DB access:** the route uses the admin Postgres client (`getAdminPostgresClient()`, RLS bypass) — there's no organization context to scope on, and the chart payload is project-internal trend data with no PII / credentials.
- **Fallback:** missing `nid`, notification row not found, wrong kind, unparseable payload, or render failure (font CDN timeout, satori throw, resvg panic) → 1×1 transparent PNG returned with the same 200 status so the `<Img>` element in the email keeps rendering an image (not an alt-text fallback). A broken inbox image is worse than a missing one.
- **Cache:** `Cache-Control: public, max-age=31536000, immutable`. Mail-client image proxies cache the PNG.

If `notificationId` ever leaks to less-trusted surfaces, or chart payloads start carrying more sensitive data, swap the raw id for an HMAC-signed token — contained change: sign in `buildChartUrl`, verify in the route.

### Testing emails locally

`pnpm --filter @app/workers test-emails:incidents` publishes a `notification-email:send` task for every seeded incident notification (event / opened / closed) in the Acme org. Prereqs: docker compose up, the `notification-emailer` worker running (`pnpm --filter @app/workers dev`), and the `email-notifications` flag on. Emails land in Mailpit at [localhost:8025](http://localhost:8025) within a second. Pass `--force` to clear `emailed_at` first so the same rows re-fire on a second run, or `--organization-id <id>` to target a non-Acme org.

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
| `apps/workers/src/workers/notification-emailer.ts` | Consumes `notification-email:send`. Resolves `LAT_WEB_URL` at boot and threads it through `NotificationEmailRenderContext` so per-kind renderers can build chart URLs. |
| `apps/web/src/routes/api/notifications/$nid/incident-trend[.]png.ts` | Public `GET /api/notifications/<notificationId>/incident-trend.png` route that renders the per-notification trend PNG via `satori` + `@resvg/resvg-js`. The `[.]` bracket keeps the literal `.png` in the URL. Row loaded via the admin client (RLS bypass). |
| `apps/web/src/domains/notifications/email-chart/` | The chart's satori renderer + lazy-loaded TTF font, used only by the route above. |
| `packages/domain/email/src/helpers/chart-url.ts` | `buildChartUrl` — builds the `apps/web` chart endpoint URL used by the sustained-incident templates. |
| `apps/web/src/routes/_authenticated/-components/notifications/` | Bell + feed + per-kind renderers. |
| `apps/web/src/routes/_authenticated/settings/account.tsx` | "Email notifications" section with per-group toggles. |
| `apps/web/src/routes/_authenticated/projects/$projectSlug/settings.tsx` | Project-level incident-kind toggles + escalation sensitivity. |

## Naming conventions

- **Kind**: `<source>.<event>` style. Examples: `incident.event`, `incident.opened`, `incident.closed`, `wrapped.report`, `custom.message`. Keep it lowercase and dot-separated. The first segment names the source aggregate or domain area; the second names what happened or what kind of thing it is. When a source has both eventful (one-shot) and sustained (open-then-close) flavors, split them into distinct kinds rather than overloading `opened` for both — the kind should reflect what the user actually receives.
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
   - **Email**: `packages/domain/email/src/templates/notifications/<kind>/index.tsx` and the entry in `NOTIFICATION_EMAIL_RENDERERS` (`registry.ts`). The renderer is an `Effect`: yield whatever services it needs (`yield* WrappedReportRepository`, etc.). If the renderer needs services beyond `SqlClient` (which the use case already provides), wire the `*Live` layer into the email worker's `rendererLayer` (`apps/workers/src/workers/notification-emailer.ts`) so the local `Effect.provide(rendererLayer)` covers it. Renderers that only need payload + context use `Effect.tryPromise(() => buildHtml(...))`.
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

### Slack is the documented exception

The recipe above assumes the new channel is per-user (each user opts in via `channelPreferencesSchema`). **Slack does not follow that model.** A Slack channel is shared by definition, so Slack delivery is an **org-level** fan-out, not a per-user one:

- **No `slack: boolean` in `channelPreferencesSchema`.** Slack opt-in is the integration itself + the route picker; per-user toggles would be meaningless when the message goes to a public channel.
- **Routes live on the integration**, not on user prefs. Specifically: `slack_integration_details.routes` jsonb, keyed by `NotificationGroup`. See [slack-integration.md](./slack-integration.md).
- **Fan-out happens at the producer (request) step**, not the per-recipient creator step. `apps/workers/src/workers/notifications.ts`'s `fanOutSlackRoutes` runs once per occurrence and publishes one `notification-slack:send` per configured channel, in parallel with the existing per-recipient `create-notification` fan-out.
- **Project-level gating still applies.** The existing `isIncidentNotificationEnabled` gate is universal — if a project disables `incidents.<kind>`, neither email nor Slack fires.
- **Idempotency** is enforced by a dedicated `slack_deliveries(idempotency_key, channel_id)` table rather than reusing the per-recipient `notifications.emailed_at` flag (no per-user row exists for Slack deliveries).

If you're adding a third channel that *is* per-user (SMS, Discord DMs, etc.), follow the original recipe. If it's another shared-room channel (Discord channels, Microsoft Teams), follow the Slack pattern instead.

## Project anchor

Set `projectId` on the `CreateNotificationRequest` for any kind tied to a project. This populates the `notifications.project_id` column, which serves three jobs:

1. **Cascade-delete** on `ProjectDeleted`: see the pipeline section.
2. **Bell-row footer**: `BaseNotification` reads `notification.projectId` and resolves the project name live via `useProjectsCollection` — so the project label stays in sync if a user renames a project, and renderers don't need to carry a snapshot.
3. **Email rendering**: `sendNotificationEmailUseCase` looks up the project once (via `ProjectRepository.findById`) and passes `{ id, name, slug }` to the per-kind email template. Templates fall back to neutral wording when the project was deleted between request and send (`project: null`).

Producers:

- Incidents: `requestIncidentNotificationsUseCase` reads `incident.projectId` and threads it through.
- Wrapped reports: the wrapped worker passes `payload.projectId` in the `request-wrapped-report-notifications` queue task; the use case threads it through.
- Project-less kinds (`custom.message`, future cross-project announcements): set `projectId: null`. The cascade ignores those rows; the bell footer omits the project label; the email template gets `project: null`.

**Don't snapshot project name/slug in notification payloads.** Use the row-level `projectId` and let renderers resolve names lazily. The old `wrappedReportPayload.projectName` was removed for this reason — it could go stale and bloated every row with redundant data. Incident payloads only carry a generic `sourceType`/`sourceId` (the issue id today); the bell renderer resolves the project slug from `notification.projectId` via `useProjectsCollection`, and the email renderer reads it from `ctx.project.slug` (looked up once in the email use case). Snapshotting **derived** data like trends, breach numbers, or per-bucket thresholds is fine and encouraged — those are point-in-time facts about the event, not live entity attributes.

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
- **Don't put routing info in the kind name.** `incident.event` describes what happened, not who needs to know. Recipient resolution and channel selection live in the producer/creator step.
- **Don't read user prefs in the producer step.** Prefs are per-channel and live with the channel decision; the producer step doesn't know about channels.
- **Don't dedupe by source entity id alone.** `notifications.idempotency_key` is per-occurrence — multiple incidents on the same issue must produce multiple notifications. `buildIdempotencyKey` is the single place that enforces this.
- **Don't add an FK constraint on `project_id`.** Per the database-postgres skill; use the application-layer cascade via `ProjectDeleted` → `delete-by-project`.

## See also

- [monitors.md](./monitors.md) — monitors are the upstream producer of incident notifications; a monitor's mute gate is the one seam into this pipeline (`request-incident-notifications` skips the fan-out for a muted monitor's incidents).
- Design spec: `specs/notifications-multi-channel.md` (decisions, trade-offs, out-of-scope, full architecture).
- Skill: `.agents/skills/notifications/SKILL.md` for agent-facing instructions.
- Skill: `.agents/skills/async-jobs-and-events/SKILL.md` for general queue/worker conventions.
- Skill: `.agents/skills/database-postgres/SKILL.md` for the no-FK rule + Drizzle conventions.
