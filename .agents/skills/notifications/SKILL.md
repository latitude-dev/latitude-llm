---
name: notifications
description: Multi-channel notifications. Adding a new notification kind, group, or channel; in-app + email delivery; per-user prefs; project-level gates; idempotency.
---

# Notifications

**When to use:** Adding a notification kind / group / channel, touching the `notifications` table or `users.notification_preferences`, wiring a new source event into the notification pipeline, or debugging in-app / email delivery.

Always read [dev-docs/notifications.md](../../../dev-docs/notifications.md) for the full picture before editing. This skill is the action-oriented summary.

## Vocabulary (and what NOT to confuse)

Three orthogonal axes — keep them straight:

| Axis | Type | Examples | Lives in |
| --- | --- | --- | --- |
| **Kind** | flat enum (event-type) | `incident.opened`, `incident.closed`, `wrapped.report`, `custom.message` | `NOTIFICATION_KIND_META` in `@domain/notifications` |
| **Group** | user-visible category | `incidents`, `wrapped_reports`, `custom_messages` | `NOTIFICATION_GROUPS` in `@domain/shared` |
| **Channel** | delivery surface | `email`, (later: `slack`, ...) | per-channel worker + registry |

`AlertIncidentKind` (`issue.new` / `issue.regressed` / `issue.escalating`) is a **fourth** axis — it lives inside the `incident.*` payload and gates the producer step at the project level. It is **not** a `NotificationKind`.

## Pipeline at a glance

```
source domain event → domain-events worker
                    → notifications:request-<group>-notifications
                    → notifications:create-notification (one per recipient)
                    → notification-email:send (if user prefs allow)
```

Project deletion cascades via a separate path: `ProjectDeleted` → `notifications:delete-by-project`.

Producers compute everything; consumers act idempotently. See dev-doc for details.

## Adding a new kind (existing group)

1. Add the kind to `NOTIFICATION_KIND_META` (`packages/domain/notifications/src/entities/notification.ts`) with `{ group, payload }`.
2. Define the payload schema in the same file. Keep it flat — no nested `event` discriminator.
3. Extend `buildIdempotencyKey` (`helpers/idempotency-key.ts`) with the new kind. Pattern: `${kind}:${naturalEntityId}` if there is one, else `${kind}:${generateId()}`.
4. Add per-channel renderers (TS will fail the build until each is present):
   - In-app: `apps/web/src/routes/_authenticated/-components/notifications/renderers/<kind>.tsx` + entry in `notification-item.tsx`'s dispatch.
   - Email: `packages/domain/email/src/templates/notifications/<kind>/index.tsx` + entry in `registry.ts`. The renderer is an `Effect` — it can `yield*` any services it needs (e.g. `WrappedReportRepository` for `wrapped.report`). If the renderer needs services beyond `SqlClient`, wire the matching `*Live` layer into the email worker's `rendererLayer` in `apps/workers/src/workers/notification-emailer.ts`. Renderers that only need payload + context use `Effect.tryPromise(() => buildHtml(...))`.
5. If the kind has its own source flow (not just wrapping an existing one):
   - Add a `request-<kind>-notifications` task to the `notifications` queue topic.
   - Write `requestXxxNotificationsUseCase` in `@domain/notifications`.
   - Route the source domain event in `apps/workers/src/workers/domain-events.ts`.
   - Add a handler in `apps/workers/src/workers/notifications.ts`.
6. If the kind is tied to a project, set `projectId` on each request so the `ProjectDeleted` cascade cleans it up.
7. Tests alongside each use case + each renderer.

**No user-preferences UI change needed.** The new kind inherits the group's existing toggle.

## Adding a new group

A new group adds a new user-visible preferences toggle and (optionally) a new project-level gate.

1. Add the group to `NOTIFICATION_GROUPS` and `NOTIFICATION_GROUP_META` in `packages/domain/shared/src/notification-preferences.ts`. `notificationPreferencesSchema` is built from `NOTIFICATION_GROUPS` and auto-extends.
2. The user-prefs settings page (`apps/web/src/routes/_authenticated/settings/account.tsx`) iterates `NOTIFICATION_GROUPS` to render toggles — the new group appears **automatically** with its label/description from the meta.
3. Add at least one kind to the new group (use the "Adding a new kind" steps).
4. **Project-level gate (optional)** — only if the new group should be opt-out-able per project:
   - Add a slot to `notificationsSettingSchema` in `packages/domain/shared/src/settings.ts`.
   - Define the inner shape (per-kind, per-target, simple boolean — whatever's useful at the project level).
   - Add a helper next to `isIncidentNotificationEnabled` and call it from the new producer use case before fan-out.
   - Update the API `ProjectSettingsSchema` in `apps/api/src/routes/projects.ts` and regenerate openapi/mcp:
     ```sh
     pnpm --filter @app/api openapi:emit
     pnpm --filter @app/api mcp:emit
     ```
   - Wire the new toggles into `apps/web/src/routes/_authenticated/projects/$projectSlug/settings.tsx`.
5. Tests: extend `request-*-notifications.test.ts` patterns; add a cross-group preference test (group X off, group Y still on).

Group keys are persisted in `users.notification_preferences` jsonb — picking a stable group key matters more than a stable label (the label is `NOTIFICATION_GROUP_META[group].label` and can change freely).

## Adding a new channel (Slack, SMS, ...)

1. New queue topic in `packages/domain/queue/src/topic-registry.ts` (e.g. `notification-slack` with `send`).
2. New per-kind renderer registry alongside the channel adapter, keyed on `NotificationKind` (exhaustive `Record`).
3. Extend `channelPreferencesSchema` in `@domain/shared/notification-preferences.ts` with the new channel key (jsonb — no migration).
4. Update the creator step in `apps/workers/src/workers/notifications.ts` to also publish the new channel's `send` task when `prefs[group].<channel>` is true. Add a `shouldSend<Channel>(prefs, kind)` helper alongside `shouldSendEmail` if it grows non-trivial.
5. New worker file mirroring `notification-emailer.ts`. Register it in `apps/workers/src/server.ts`.
6. Settings UI in `apps/web/src/routes/_authenticated/settings/account.tsx`: extend the per-group block to show one switch per channel.

Source events, the producer step, the in-app feed, and the kind registry are all unchanged.

## Idempotency rules

- Producers publish with deterministic `dedupeKey`. The queue layer drops duplicate emits.
- The creator step inserts via `ON CONFLICT (organization_id, user_id, idempotency_key) DO NOTHING ... RETURNING`. Only the "wrote it" branch publishes downstream channel jobs.
- The emailer claims the row via `markEmailed` (`UPDATE … WHERE emailed_at IS NULL RETURNING id`) **before** sending. SMTP failures post-claim are lost emails — the trade-off is zero duplicates, which the design picked over zero misses.
- `delete-by-project` is naturally idempotent (`DELETE … RETURNING` returns zero on re-runs).

If you change ordering (e.g. send-then-stamp): you'll get duplicate emails. Don't.

## Anti-patterns

- ❌ Filtering inside renderers ("don't send if X"). The producer/creator already decided — renderers just render.
- ❌ Putting routing info in the kind name. `incident.opened` describes what happened, not who needs to know.
- ❌ Reading user prefs in the producer step. Prefs are per-channel and belong in the creator's "should I publish this channel's send task" decision.
- ❌ FK constraint on `project_id`. Use the application-layer cascade via `ProjectDeleted` → `delete-by-project`. Per the [database-postgres](../database-postgres/SKILL.md) skill.
- ❌ Deduping by source entity id alone. Use `buildIdempotencyKey` — the key must be per-occurrence, not per-entity (multiple incidents on the same issue = multiple notifications).
- ❌ Mutating settings keys in place. `NOTIFICATION_GROUPS` entries are persisted in jsonb; renaming a group orphans existing user prefs. Add new groups; deprecate old ones with a no-op renderer if needed.

## See also

- [dev-docs/notifications.md](../../../dev-docs/notifications.md) — full reference (concepts, file index, pipeline, defaults, all the details).
- [specs/notifications-multi-channel.md](../../../specs/notifications-multi-channel.md) — design spec (why these decisions).
- [async-jobs-and-events](../async-jobs-and-events/SKILL.md) — queue/worker conventions, domain-event naming.
- [database-postgres](../database-postgres/SKILL.md) — Drizzle, RLS, no-FK rule.
