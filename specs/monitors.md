# Monitors

> Eventual durable home: `dev-docs/monitors.md` (created at the end of this plan; this spec is removed at that point).

## Purpose

This spec defines the **Monitors** feature: a domain entity that owns _what to watch_ and _when an incident is open_. It supersedes today's split between project-level "incident notification toggles" and the alert-incident firing pipeline, and extends alerting to saved searches.

A **Monitor** is the user-facing umbrella under which one or more **alerts** live. Each alert is a `(kind, source, condition, severity)` tuple. When any of a monitor's alerts fires, the existing notifications pipeline takes over: a single `alert_incidents` row is written carrying the `monitor_alert_id` (the owning monitor is resolved via a join, not denormalised), an `IncidentCreated` event flows out, and downstream the `request-incident-notifications` → `create-notification` → `notification-email:send` chain handles delivery with no monitor-specific code.

**Monitors do not own notification configuration**. Notification settings live where they already do — per-organization and per-project gating on `projects.settings.notifications` / `users.notification_preferences`. The single new wire from monitors into the notifications domain is a **mute gate**: when an incident is created by a monitor and that monitor is muted, the producer step skips the fan-out so no notification rows are written.

## Goals

- One UI surface — the **Monitors** page — where users see, configure, mute, and (for non-system monitors) delete every alert in their project.
- One backend pipeline — monitor → alert evaluation → incident → existing notifications fan-out — that subsumes both today's issue-event path and a new saved-search path.
- A **`monitors` feature flag** to roll out the new path behind a gate while legacy behaviour keeps running for orgs without it.
- A data model whose lifecycle distinction (system vs user-managed) is independent of the alert source type, so the product can later add system monitors of any source type and open user-creatable monitors to any source type without schema churn.
- Visible progress as early as possible: each milestone PR ships something a stakeholder can click on, even when the backend isn't fully wired.

## Non-goals

- New notification channels in the monitors domain. Channels are owned by `@domain/notifications` and gated by org/project settings — monitors only set the `monitor_alert_id` on the incident and (optionally) mute it.
- Per-monitor notification settings. Out of scope by design — see "Notifications" below.
- New alert evaluation algorithms for issues. The seasonal-anomaly detector (`evaluateSeasonalEscalation` in `packages/domain/issues/src/helpers.ts`) is reused as-is — both for `issue.escalating` and for the new saved-search `expected`-mode threshold. Its sensitivity moves from `projects.settings.escalation.sensitivity` onto the monitor's alert condition (hardcoded default on the system monitor; user-chosen for saved-search `expected` alerts).
- Slack channel. The existing `slack` flag and integration already exist; nothing in this spec touches that pipeline.
- Cleaning up the old code paths around per-kind notification gating (`projects.settings.notifications.incidents`). We leave them in place under the unflagged branch, gate the new path, and revisit in a future cleanup PR once the `monitors` flag is on for everyone.

## Glossary

| Term | Meaning |
|---|---|
| **Monitor** | A user-facing entity that owns one or more alerts. Scoped to a single project. Mute prevents notifications; soft-delete hides and stops the monitor firing. |
| **System monitor** | A monitor with `system = true`. Auto-provisioned per project; not deletable; structurally locked (no add/remove alerts, fixed name/kind/source/severity). Editable surface: mute/unmute, plus the configurable values of its predefined alerts (e.g. the `issue.escalating` alert's `sensitivity`). |
| **Alert** (`MonitorAlert`) | A `(kind, source, condition, severity)` tuple owned by a monitor. Multiple alerts per monitor are allowed; firing any of them produces an incident. |
| **Alert kind** | A discriminated enum identifying the watched signal: `issue.new`, `issue.regressed`, `issue.escalating`, `savedSearch.match`, `savedSearch.threshold`, `savedSearch.escalating`. |
| **Alert source** | The entity the alert watches: `{ type, id? }`. `id = null` means "all of that type". |
| **Alert condition** | A polymorphic config that parameterises the kind's evaluator. `null` for kinds that need no parameters. |
| **Severity** | `low | medium | high`. Copied onto the incident; drives badge tone and email subject tone. |
| **Incident** | A row in `alert_incidents` linked to its firing alert via `monitor_alert_id` (and through that alert, to the owning monitor). Eventful kinds (`issue.new`, `issue.regressed`, `savedSearch.match`, threshold point-in-time) have `endedAt = startedAt`; sustained kinds (`issue.escalating`, `savedSearch.escalating`) leave `endedAt = null` until the condition clears. |

## Current state

Three pieces of existing work this spec builds on:

- **Alert incidents** — `specs/alerts.md`, `packages/domain/alerts/`. The `alert_incidents` table and firing/closing logic for `issue.new` / `issue.regressed` / `issue.escalating` are in place. The escalating detector lives in `packages/domain/issues/src/helpers.ts` (`evaluateSeasonalEscalation`).
- **Multi-channel notifications** — `specs/notifications-multi-channel.md`, `dev-docs/notifications.md`. The producer → creator → channel pipeline (`apps/workers/src/workers/notifications.ts`, `notification-emailer.ts`) is reused unchanged for monitor-driven incidents. The only modification is in the producer step, which adds a mute check. **Important distinction**: the three system monitors replace today's three project-level per-kind toggles in `projects.settings.notifications.incidents` (the "Notify when a new issue is discovered" / "Notify when an issue regresses" / "Notify when an issue starts or stops escalating" checkboxes on the `/settings/issues` page). They do **not** replace the per-user-per-group preferences in `users.notification_preferences` (`incidents`, `wrapped_reports`, `custom_messages` group toggles) — those continue to apply to monitor-driven incidents unchanged.
- **Saved searches** — `packages/domain/saved-searches/`, `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`. Today they live on a standalone `/search` page (which since #3320 hosts the unified session-rollup search and the saved-searches list together — `/session-search` was retired in that PR, and the `save-search-modal`, `saved-searches-list`, and `search-syntax-legend` components already live in the shared `-components/` directory alongside the traces/sessions views). Saved searches still carry `assignedUserId` / `createdByUserId` fields. Monitors reference saved searches by id; the standalone `/search` route goes away and its functionality folds into the `/` page's Sessions and Traces tabs, and the user columns are dropped.

## Conceptual model

```
┌─────────────────────────────────────────────────────────────┐
│ Monitor                                                     │
│   id, organizationId, projectId, slug, name, description    │
│   system: boolean                                           │
│   mutedAt?, deletedAt?, createdAt, updatedAt                │
│                                                             │
│   ┌────────────────────────────┐                            │
│   │ MonitorAlert[] (1..n)      │                            │
│   │   kind                     │                            │
│   │   source { type, id? }     │                            │
│   │   condition?               │                            │
│   │   severity                 │                            │
│   └────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
            │
            ▼   each firing produces
┌─────────────────────────────────────────────────────────────┐
│ AlertIncident                                               │
│   id, organizationId, projectId                             │
│   monitorAlertId? (new) ── join → MonitorAlert → Monitor    │
│   condition? (new, snapshotted)                             │
│   sourceType, sourceId, kind, severity                      │
│   startedAt, endedAt?                                       │
│   entrySignals?, exitEligibleSince?                         │
└─────────────────────────────────────────────────────────────┘
            │
            ▼   IncidentCreated / IncidentClosed
┌─────────────────────────────────────────────────────────────┐
│ existing @domain/notifications pipeline                     │
│   request-incident-notifications                            │
│     ┌──────────────────────────────────────────────────┐    │
│     │ NEW: if incident.monitorAlertId, resolve its     │    │
│     │ monitor (join through monitor_alerts, incl.      │    │
│     │ soft-deleted); if monitor.mutedAt, skip the      │    │
│     │ whole fan-out. Project-level gates + user prefs  │    │
│     │ still apply for monitor-driven incidents.        │    │
│     └──────────────────────────────────────────────────┘    │
│   → create-notification → notification-email:send → …       │
└─────────────────────────────────────────────────────────────┘
```

### Cardinality rules

- A monitor has **at least one alert**. Enforced in the create/update use-cases (not as a DB constraint).
- Multiple alerts on a single monitor are allowed in any combination — both within the same kind and across kinds.
- The data model places no restriction on which source types can appear on system vs user-managed monitors. The two MVP product rules below are enforced in code via constants, not schema:
  - **System monitors are structurally locked** — the create/update use-cases reject adding, removing, or replacing their alerts and changing an alert's `kind`/`source`/`severity`, and reject deleting the monitor or editing name/description. What stays editable: `mutedAt`, and the *configurable values* of each predefined alert (its `condition` parameters — e.g. the `issue.escalating` alert's `sensitivity`; `issue.new`/`issue.regressed` carry `null` conditions, so nothing to tune). Today: the three hardcoded issue monitors. The data model is agnostic to source type — future system monitors of any source type are unblocked.
  - **User-creatable monitors** are restricted via a `USER_CREATABLE_ALERT_KINDS` allowlist. Today: the three `savedSearch.*` kinds. Future product expansion is one constant edit; no migration.

### Lifecycle

- **Mute** sets `mutedAt = now()`. Incidents continue to be created. The notifications producer step short-circuits when `incident.monitorAlertId` resolves (through its alert) to a muted monitor.
- **Soft delete** sets `deletedAt = now()` (user-managed monitors only; the use-case rejects on `system === true`). The monitor disappears from lists and stops firing. Existing incidents remain queryable.
- **Source cascade** — when a referenced source entity (issue or saved search) is hard- or soft-deleted, every alert with `source.id === <deletedEntityId>` is **soft-deleted** (`deleted_at = now()`) — never hard-deleted, so `alert_incidents.monitor_alert_id` pointers stay resolvable. If that empties a monitor's active alert list, the monitor is soft-deleted in the same transaction. System monitors are unaffected because their alert sources are configured `id = null` ("all of type").
- **Removing the last alert** from a user-managed monitor is rejected by the update use-case. The UI flow offers "Delete monitor" once the last alert is about to go.

## Data model

All comments below land **verbatim in code** (entity-level JSDoc), so future readers can `cmd-click` and understand each field without re-deriving it from this spec.

### Shared enums (`@domain/shared`)

#### `AlertIncidentSourceType`

```ts
/**
 * The kind of entity an alert watches. Determines which Latitude domain
 * owns the matching/lifecycle logic for the alert. `issue` watches issue
 * lifecycle events (created, regressed, escalating). `savedSearch` watches
 * traces that match the referenced saved search's `query` + `filterSet`.
 */
export const ALERT_INCIDENT_SOURCE_TYPES = ["issue", "savedSearch"] as const
export type AlertIncidentSourceType = (typeof ALERT_INCIDENT_SOURCE_TYPES)[number]
```

#### `AlertIncidentKind`

```ts
/**
 * Discriminator that, paired with the source type and condition, fully
 * determines the firing logic for an alert. Each kind has a fixed
 * `sourceType` — they are not interchangeable.
 *
 *   issue.new           — fires when an issue is created from a score
 *   issue.regressed     — fires when a resolved issue receives a new score
 *   issue.escalating    — fires when an issue's recent occurrence band
 *                          exceeds its seasonal baseline (sustained;
 *                          closes when the band returns or 72h timeout).
 *                          Sensitivity travels on the alert's condition
 *                          (`{ sensitivity? }`), provisioned with a hardcoded
 *                          default on the system monitor.
 *   savedSearch.match   — fires every time a new trace matches the saved
 *                          search (point-in-time)
 *   savedSearch.threshold
 *                       — fires when the match count crosses a configured
 *                          threshold. Absolute mode is one-time
 *                          (cumulative-since-creation milestone); multiplier
 *                          mode is a spike detector that can re-fire on
 *                          each rising edge. Both produce point-in-time
 *                          notifications.
 *   savedSearch.escalating
 *                       — fires when the match count sustains above a
 *                          configured threshold for a `window` period
 *                          (sustained; closes after the same `window`
 *                          of the condition no longer holding).
 */
export const ALERT_INCIDENT_KINDS = [
  "issue.new",
  "issue.regressed",
  "issue.escalating",
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const
export type AlertIncidentKind = (typeof ALERT_INCIDENT_KINDS)[number]

/**
 * Static map enforced at the type level: each alert kind has exactly one
 * legal source type. Used by the create/update use-cases to reject
 * mismatched combinations before they hit the DB.
 */
export const ALERT_INCIDENT_KIND_SOURCE_TYPE: Record<AlertIncidentKind, AlertIncidentSourceType> = {
  "issue.new":              "issue",
  "issue.regressed":        "issue",
  "issue.escalating":       "issue",
  "savedSearch.match":      "savedSearch",
  "savedSearch.threshold":  "savedSearch",
  "savedSearch.escalating": "savedSearch",
}

/**
 * Whether the incident is a one-shot event (start == end) or a sustained
 * state that needs closing. Drives both the `endedAt` write semantics on
 * incident creation and which notification kinds the existing pipeline
 * picks (`incident.event` for point, `incident.opened` + `incident.closed`
 * pair for sustained).
 */
export const ALERT_INCIDENT_KIND_LIFECYCLE: Record<AlertIncidentKind, "point" | "sustained"> = {
  "issue.new":              "point",
  "issue.regressed":        "point",
  "issue.escalating":       "sustained",
  "savedSearch.match":      "point",
  "savedSearch.threshold":  "point",
  "savedSearch.escalating": "sustained",
}

/**
 * Alert kinds that today's product surfaces let users add to a monitor
 * they create or edit. The data model places no restriction here — the
 * field exists so the create/update use-cases can reject kinds that are
 * supposed to live exclusively on system monitors (currently the three
 * `issue.*` kinds). Future product expansion is a one-constant edit.
 */
export const USER_CREATABLE_ALERT_KINDS = [
  "savedSearch.match",
  "savedSearch.threshold",
  "savedSearch.escalating",
] as const satisfies readonly AlertIncidentKind[]
```

#### `AlertIncidentCondition`

```ts
/**
 * Polymorphic alert condition. The `kind` of the parent alert chooses
 * the variant; kinds with no parameters store `null`. Keeping every
 * variant in a single discriminated union lets one jsonb column carry
 * every shape without schema churn per new kind.
 *
 * `issue.escalating` carries `{ sensitivity? }` — the seasonal detector's
 * tuning lives WITH the monitor, not in `projects.settings.escalation`. The
 * system "Issue escalating" monitor is provisioned with a hardcoded default
 * (`DEFAULT_ESCALATION_SENSITIVITY_K`); flag-off orgs still read project
 * settings on the legacy path until the post-rollout cleanup.
 *
 * `issue.new` / `issue.regressed` need no parameters → `condition: null`.
 * `savedSearch.match` has none either (the look-back window and the throttle
 * interval are the same single value, hardcoded to 5 minutes — see
 * "Saved-search firing" below), so it also stores `condition: null`.
 */
export type AlertIncidentCondition =
  | AlertIncidentSavedSearchThresholdCondition
  | AlertIncidentSavedSearchEscalatingCondition
  | AlertIncidentIssueEscalatingCondition

/**
 * Sustained issue-escalation alert. Carries the seasonal detector's
 * `sensitivity` (1–6, same scale/meaning as the old
 * `projects.settings.escalation.sensitivity`: lower = noisier) so it travels
 * with the monitor. `undefined` falls back to `DEFAULT_ESCALATION_SENSITIVITY_K`.
 */
export type AlertIncidentIssueEscalatingCondition = {
  kind: "issue.escalating"
  sensitivity?: number // 1–6
}

/**
 * A positive duration expressed in whole hours or days.
 */
export type AlertDuration = { unit: "hours"; hours: number } | { unit: "days"; days: number }

/**
 * The fixed-window baseline a `multiplier`-mode threshold compares current
 * activity against. Both variants carry the same `lookback` duration — only
 * `kind` changes how it's interpreted (a week is just `{ days: 7 }`):
 *
 *   average — the rolling average rate over the trailing `lookback`
 *             (`[now - lookback, now]`). The common "vs my normal traffic"
 *             case. Longer lookbacks smooth out one-off spikes.
 *   period  — the single equal-length period immediately before now
 *             (`[now - 2×lookback, now - lookback]`): `{ days: 1 }` is
 *             "yesterday", `{ days: 7 }` "the previous week". One specific
 *             past period, not a smoothed average — for day/week seasonality.
 *
 * The dynamically-learned "expected" baseline is NOT here — it carries a
 * `sensitivity` rather than a `factor`, so it's a distinct threshold mode
 * (see `AlertCountThreshold`).
 */
export type AlertBaseline = {
  kind: "average" | "period"
  lookback: AlertDuration
}

/**
 * The "X times" parameter used by saved-search condition variants.
 *
 *   absolute   — `{ mode: "absolute", count }` — a fixed match count.
 *   multiplier — `{ mode: "multiplier", factor, baseline }` — threshold value
 *                = `factor × baseline`, the baseline being a fixed window
 *                normalised to the "current" window's size (see the evaluator
 *                section for the math).
 *   expected   — `{ mode: "expected", sensitivity? }` — compares current
 *                activity against the *dynamically learned* expectation for
 *                this point in the day/week, via the same seasonal-grid
 *                detector (`evaluateSeasonalEscalation`) that powers
 *                `issue.escalating`. No fixed window, no `factor`: the single
 *                knob is `sensitivity` (1–6, the detector's σ-multiplier;
 *                lower = noisier), surfaced to users as the "N times more than
 *                expected" amount. `undefined` → `DEFAULT_ESCALATION_SENSITIVITY_K`.
 *
 * All three are supported on both `savedSearch.threshold` (current window
 * hardcoded to 5 min, the throttle interval) and `savedSearch.escalating`
 * (current window = the user-configured `window` field).
 *
 * Humanised examples (the full sentence prefixes with "Alerts when traces
 * matching '<search>' are " — see `formatHumanReadableAlert`):
 *   { mode: "absolute", count: 100 }
 *     → "detected 100 times"
 *   { mode: "multiplier", factor: 3,
 *     baseline: { kind: "average", lookback: { unit: "days", days: 7 } } }
 *     → "detected 3 times more than the average of the last 7 days"
 *   { mode: "multiplier", factor: 2,
 *     baseline: { kind: "period", lookback: { unit: "days", days: 1 } } }
 *     → "detected 2 times more than yesterday"
 *   { mode: "expected", sensitivity: 2 }
 *     → "detected 2 times more than expected"
 */
export type AlertCountThreshold =
  | { mode: "absolute"; count: number }
  | { mode: "multiplier"; factor: number; baseline: AlertBaseline }
  | { mode: "expected"; sensitivity?: number }

/**
 * Threshold-based alert. The two modes have different rearm semantics
 * but the same notification shape — each firing produces a single
 * point-in-time notification (no separate "closed" notification), so
 * the recipient always sees one alarm per crossing event.
 *
 * - `absolute` ("100 times"): one-time milestone. Fires exactly once,
 *   when the cumulative count of matches since the monitor was created
 *   crosses `threshold`. After firing, the alert is durably "spent" —
 *   the firing logic short-circuits on any prior incident for this
 *   monitor alert, regardless of close state. Re-arm requires the user
 *   to remove and re-add the alert.
 *
 * - `multiplier` ("3 times more than the average of the last 7 days"): spike
 *   detector that can re-fire. The "current" side of the comparison is the
 *   match count over the last 5 minutes (= the firing throttle interval;
 *   not user-configurable, kept simple). The "baseline" side is derived from
 *   `baseline` (average lookback or previous calendar period), normalised to
 *   a 5-minute slice. `isMet` when (current >= factor × normalisedBaseline). Re-arm
 *   happens via the incident row itself: the firing creates an
 *   `alert_incidents` row with `endedAt = null` and emits a single
 *   `IncidentCreated` notification; while the condition keeps holding,
 *   no further notifications fire; when the condition drops, the row
 *   is silently closed (`endedAt = now`, no `IncidentClosed`
 *   notification), and the next rising edge produces a new incident.
 *
 *   The incidents panel will render the open row as "Ongoing since X"
 *   while the spike is still active — useful context, even though the
 *   alarm itself was one-shot.
 */
export type AlertIncidentSavedSearchThresholdCondition = {
  kind: "savedSearch.threshold"
  threshold: AlertCountThreshold // absolute (one-time) OR multiplier (rearm)
}

/**
 * Sustained alert. The count is taken over a rolling `window` ending at
 * evaluation time; the same `window` doubles as the dwell-on-exit for
 * the close transition. This single field is what the user types into
 * the form ("for at least 5 minutes") and it plays two roles in the
 * state machine:
 *
 *   - **Count window**: at every evaluation tick, `count = matches in
 *     [now - window, now]`. The window is the user's lever for ignoring
 *     transient spikes — a 1-second burst doesn't trip a 5-minute
 *     window because the spike's contribution to the rolling count
 *     ages out quickly.
 *   - **Exit dwell**: when `isMet` flips from true to false on an open
 *     incident, the dwell timer (`exitEligibleSince`) starts. The
 *     incident closes once the condition has stayed false for `window`
 *     minutes continuously.
 *
 * Minimum 5 minutes (= the throttle interval of the firing task; a
 * shorter window would be evaluated less often than it claims).
 */
export type AlertIncidentSavedSearchEscalatingCondition = {
  kind: "savedSearch.escalating"
  threshold: AlertCountThreshold // absolute or multiplier
  window: { minutes: number }    // ≥ 5
}
```

#### `AlertIncidentSeverity`

```ts
/**
 * User-facing severity attached to the alert and copied onto each
 * incident at creation time. Drives badge colour, email subject tone,
 * and (later) Slack channel routing. Hardcoded for system monitors,
 * user-selectable for non-system monitors.
 */
export const ALERT_SEVERITIES = ["low", "medium", "high"] as const
export type AlertIncidentSeverity = (typeof ALERT_SEVERITIES)[number]
```

### Monitor entity (`@domain/monitors`)

```ts
/**
 * A user-managed entity that owns one or more alerts. Scoped to a single
 * project. Mute disables notification dispatch but keeps incident
 * creation running; soft-delete hides it from lists and stops it firing.
 *
 * Monitors do NOT own notification configuration. Notification routing
 * lives in `@domain/notifications` and is gated by org/project settings
 * and per-user preferences. The only seam from monitors into that pipeline
 * is `mutedAt`: when a monitor-driven incident reaches the notifications
 * producer (`request-incident-notifications`), a muted monitor short-
 * circuits the fan-out.
 *
 * `system: true` monitors are auto-provisioned per project (today: the
 * three issue monitors below) and cannot be deleted. They are
 * *structurally* locked — name/description/slug fixed, alert set fixed
 * (no add/remove, no kind/source/severity change) — but `mutedAt` and the
 * configurable values of their predefined alerts (an alert's `condition`
 * parameters, e.g. the `issue.escalating` alert's `sensitivity`) stay
 * editable. The system-vs-user distinction is orthogonal to source type —
 * future system monitors of any source type are accommodated by the data
 * model with no schema change.
 */
export type Monitor = {
  id: MonitorId
  organizationId: OrganizationId
  projectId: ProjectId
  /**
   * URL-safe identifier derived from `name`; regenerated when the name
   * changes meaningfully. Unique per project (with soft-delete nulls
   * partitioning the constraint). For system monitors, the slug is
   * fixed at provision time — never regenerated since the name is
   * immutable.
   */
  slug: string
  name: string
  description: string
  system: boolean
  alerts: readonly MonitorAlert[]
  mutedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Firing condition owned by a monitor. `source.id` is optional —
 * leaving it `null` means the alert watches all entities of `source.type`
 * in the project. The (kind, source.type) pair is constrained by
 * `ALERT_INCIDENT_KIND_SOURCE_TYPE` and validated in the use-cases.
 *
 * `condition` is `null` when the kind has no tunable parameters
 * (`issue.new`, `issue.regressed`, `savedSearch.match`). Otherwise it carries
 * the kind-specific shape from `AlertIncidentCondition` — including
 * `issue.escalating`, which carries `{ sensitivity? }`.
 *
 * `severity` is independent of kind — the user (or system definition)
 * chooses how loud each alert sounds.
 */
export type MonitorAlert = {
  id: MonitorAlertId
  monitorId: MonitorId
  kind: AlertIncidentKind
  source: {
    type: AlertIncidentSourceType
    id: string | null
  }
  condition: AlertIncidentCondition | null
  severity: AlertIncidentSeverity
}
```

### Postgres schema

Two new tables; one column addition; one column rename of nothing — additive only.

```sql
CREATE TABLE latitude.monitors (
  id              varchar(24) PRIMARY KEY,
  organization_id varchar(24) NOT NULL,
  project_id      varchar(24) NOT NULL,
  slug            varchar(128) NOT NULL,
  name            varchar(128) NOT NULL,
  description     text         NOT NULL DEFAULT '',
  system          boolean      NOT NULL DEFAULT false,
  muted_at        timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX monitors_project_slug_uq
  ON latitude.monitors (project_id, slug) WHERE deleted_at IS NULL;

CREATE INDEX monitors_org_project_active_idx
  ON latitude.monitors (organization_id, project_id) WHERE deleted_at IS NULL;

ALTER TABLE latitude.monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitors_org_isolation_policy ON latitude.monitors
  USING (organization_id = current_setting('app.organization_id', true));

CREATE TABLE latitude.monitor_alerts (
  id              varchar(24) PRIMARY KEY,
  organization_id varchar(24) NOT NULL,
  monitor_id      varchar(24) NOT NULL,
  kind            varchar(64) NOT NULL,        -- AlertIncidentKind
  source_type     varchar(32) NOT NULL,        -- AlertIncidentSourceType
  source_id       varchar(24),                 -- null means "all of source_type"
  condition       jsonb,                       -- AlertIncidentCondition | null
  severity        varchar(16) NOT NULL,        -- AlertIncidentSeverity
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz                  -- SOFT delete; see below
);

-- Non-partial: serves both active-alert loads (the query filters
-- `deleted_at IS NULL`) and the `alert_incidents` → monitor join, which must
-- still resolve alerts that were soft-deleted after firing an incident.
CREATE INDEX monitor_alerts_monitor_idx
  ON latitude.monitor_alerts (monitor_id);

-- Hot path: "find ACTIVE alerts watching savedSearch X". Partial on live rows
-- — soft-deleted alerts never fire, so they're excluded from the firing scan.
CREATE INDEX monitor_alerts_source_idx
  ON latitude.monitor_alerts (organization_id, source_type, source_id)
  WHERE deleted_at IS NULL;

ALTER TABLE latitude.monitor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY monitor_alerts_org_isolation_policy ON latitude.monitor_alerts
  USING (organization_id = current_setting('app.organization_id', true));

ALTER TABLE latitude.alert_incidents
  ADD COLUMN monitor_alert_id varchar(24),  -- which specific alert fired (FK-less)
  ADD COLUMN condition        jsonb;        -- snapshot of the firing MonitorAlert.condition

-- Hot path: "list incidents for this monitor alert" (join target for the
-- monitor incidents panel) and "has this alert fired? / find its open
-- incident" (savedSearch threshold + escalating rearm).
CREATE INDEX alert_incidents_monitor_alert_idx
  ON latitude.alert_incidents (monitor_alert_id) WHERE monitor_alert_id IS NOT NULL;
```

**The owning monitor is NOT denormalised onto `alert_incidents`.** An incident stores only `monitor_alert_id`; the monitor is recovered by joining through `monitor_alerts` (`alert_incidents.monitor_alert_id = monitor_alerts.id`, then `monitor_alerts.monitor_id`). `monitor_alert_id` also gives us the granularity the saved-search state machines need — a single monitor can carry multiple alerts of the same kind on the same source (e.g. two `savedSearch.escalating` alerts with different thresholds), and those machines query "open incident for *this alert*", not "for this monitor".

**Why `monitor_alerts` is soft-deleted (not hard-deleted).** Incidents are historical records that must stay attributable to their monitor forever — including after the firing alert is removed from the monitor or its source is deleted. If alerts were hard-deleted, the join above would drop every incident whose alert no longer exists, silently erasing incident history from the monitor's panel. Soft-deleting alerts (`deleted_at = now()`) keeps the join resolvable. The trade-off vs. denormalising `monitor_id` onto the incident: one nullable timestamp on `monitor_alerts` plus a `deleted_at IS NULL` filter on the active-alert reads, instead of a denormalised column kept in sync. Active-alert reads (the monitor's `alerts` list, the firing scan) filter `deleted_at IS NULL`; the incident→monitor join deliberately does **not**, so it still resolves soft-deleted alerts.

Per the codebase no-FK rule, none of the references above carry an FK constraint; integrity is maintained by the cascade logic in use-cases and the `monitor_alert_id IS NULL` fallback in `alert_incidents`.

#### Why snapshot `condition` on the incident

A user can edit a monitor mid-incident: bump the threshold, change the window. The incident that's already open was opened under the previous condition — both the notification emails and the close-side re-evaluation should use the original. Snapshotting `condition` onto `alert_incidents` at creation time makes the row self-describing for the whole notifications pipeline (the in-app and email templates need it to render the humanised "Alert: when matches > 100 in 5 minutes" line) and isolates ongoing incidents from monitor edits.

For point-in-time kinds, the snapshot is just informational. For sustained kinds, the close-side worker reads the snapshot to know what to re-evaluate against.

#### `entrySignals` polymorphism

The existing `alert_incidents.entrySignals` (jsonb) column already serves `issue.escalating` as the seasonal-signal snapshot used by the close-side comparison. We **reuse** that column for saved-search incidents instead of adding a new one — the shape varies by alert kind:

- `issue.escalating` (existing): the seasonal-signal snapshot, exactly as today.
- `savedSearch.escalating` (new): `{ evaluatedThreshold: number, baselineCount?: number, baseline?: AlertBaseline }`. `baselineCount` and `baseline` are present only for multiplier-mode conditions. The frozen `evaluatedThreshold` is what the close-side compares the live `count` against — the multiplier baseline is *not* re-resolved at evaluation time.
- Other kinds (`issue.new`, `issue.regressed`, `savedSearch.threshold`, `savedSearch.match`): not used. Column stays `null`.

Per-kind narrowing happens at the read site via a Zod parse, mirroring how `payloadSchemaFor(kind)` works in `@domain/notifications`.

### Saved-search schema changes

`assigned_user_id` and `created_by_user_id` columns on `saved_searches` go away in the milestone that also removes the standalone search page and the `assign` endpoint. Until that milestone lands, the columns stay and every use site gets a `// TODO: Remove this after releasing monitors for everybody` annotation.

### `alert_incidents.monitorAlertId` and `condition` write semantics

- Monitor-driven incidents: `monitorAlertId` set (the specific firing alert), `condition` set (snapshot of that alert's condition or `null` if the alert had no condition). The owning monitor is resolved via the join, never stored.
- Legacy issue-event path, orgs without the `monitors` flag: `monitorAlertId = null`, `condition = null`. The producer step in `request-incident-notifications` continues to consult `projects.settings.notifications.incidents` for these.
- Once an org has the `monitors` flag enabled: the issue-event worker resolves the matching system monitor's alert and writes its `monitorAlertId` + the snapshot condition.

### "Did this incident notify anyone?" derivation

We don't store this on `alert_incidents`. Notification rows carry `idempotencyKey` in the format `${notificationKind}:${alertIncidentId}` (`buildIdempotencyKey` in `@domain/notifications`), and the existing `UNIQUE(organization_id, user_id, idempotency_key)` index supports a prefix scan on `(organization_id, …)` filtered by `idempotency_key`. The dashboard query for the "Notified"/"Muted" badge in the incidents details panel is:

```sql
SELECT idempotency_key FROM notifications
WHERE organization_id = $org
  AND idempotency_key = ANY(ARRAY['incident.event:<id>', 'incident.opened:<id>', 'incident.closed:<id>'])
LIMIT 1;
```

The "Notified" verdict is `EXISTS(any row) ⇒ Notified, else Muted`. No new index is needed — org-level cardinality is bounded (tens of users) so the prefix scan is cheap. The query is batched across visible incidents in one round-trip.

## Architecture

### Issue-driven alerts (existing path, additive change)

```
IssueCreated / IssueRegressed / IssueEscalated / IssueEscalationEnded
    │
    ▼  alert-incidents worker (apps/workers/src/workers/domain-events/alert-incidents.ts)
[NEW] resolveMonitorsForSourceEvent({ orgId, projectId, kind, sourceId })
    │  Returns the list of monitors whose alerts match:
    │    - kind = event kind
    │    - source.type = "issue"
    │    - source.id IS NULL OR source.id = sourceId
    │
    │  If the org does NOT have the `monitors` flag, skip the lookup and
    │  write a single legacy incident with monitorAlertId = null.
    │  (Existing project-level gate in request-incident-notifications
    │  continues to apply for legacy rows.)
    │
    ▼
createAlertIncidentFromIssueEventUseCase  (one row per matching alert)
    │  Each row carries monitorAlertId (the matching alert), condition
    │  (snapshot or null), severity (from the matching alert; if multiple
    │  matched, see "Severity merging" below), startedAt (see "startedAt
    │  backtracking" below), and the standard issue-event fields
    │  (sourceId, kind, entrySignals for escalating).
    ▼
IncidentCreated outbox event
    │
    ▼  domain-events worker → notifications:request-incident-notifications
request-incident-notifications  (apps/workers/src/workers/notifications.ts)
    │  [NEW] If incident.monitorAlertId IS NOT NULL:
    │    - Resolve the alert (incl. soft-deleted) → its monitor; if the
    │      monitor's mutedAt is set, return { skipped: "monitor-muted" }.
    │    - Otherwise, build notification requests as today.
    │      Project-level notifications.incidents gate still applies (it is
    │      org-wide noise control, orthogonal to monitor scoping).
    │  Else: existing behaviour unchanged.
    ▼
create-notification → notification-email:send → …
```

#### Severity merging

If a single issue event matches multiple monitors (the common case is "the all-issues system monitor matches" plus "the user has a monitor narrowed to that specific issue.id"), one incident is written per matching monitor. Each incident carries the severity of its monitor's matching alert. The notifications pipeline treats them independently — that's the right behaviour: muting one monitor doesn't mute the other.

#### `startedAt` backtracking for `issue.escalating`

Today `createAlertIncidentFromIssueEventUseCase` sets `startedAt = occurredAt` (the escalation event time) for all kinds. For `issue.escalating`, this is late: the seasonal detector flags an escalation only after the band has been crossed for a while, so the "real" start is meaningfully earlier. We backtrack `startedAt` to the **first bucket in the trend window where the occurrence count crossed the seasonal threshold**.

Note: the `entrySignals` snapshot holds only scalar stats (expected / σ / thresholds / entry-time 24h count), **not** a timestamped timeline, so the backtrack cannot read buckets from it. Instead it reuses the analytics queries that already back the issue trend chart — `ScoreAnalyticsRepository.histogramByIssues` (per-bucket occurrence counts over a bounded window) and `escalationThresholdHistogramByIssues` (per-bucket seasonal threshold, same `kShort`) — and walks the two series in lockstep over a 24h window of 1h buckets to find the first bucket where `count ≥ threshold`; that bucket's start becomes `startedAt`.

The natural home for this is the producer side (`checkIssueEscalationUseCase`, which already has `ScoreAnalyticsRepository` + `ChSqlClient`): it resolves the backtracked timestamp and forwards it on the `IssueEscalated` event, which the alert-incidents worker passes through as `occurredAt`. Because it changes the existing **non-flag-gated** escalation path, it lands in **M6** alongside the rest of the issue-event work, not in M3.

For other kinds, behaviour is unchanged (`issue.new` / `issue.regressed` are eventful — `startedAt = endedAt = occurredAt` stays correct).

#### Escalation sensitivity sourcing

Sensitivity moves **onto the monitor**. The system "Issue escalating" monitor is provisioned with its alert `condition = { kind: "issue.escalating", sensitivity: DEFAULT_ESCALATION_SENSITIVITY_K }` (M3), and the flag-on detector path reads `sensitivity` from that condition rather than from `projects.settings.escalation.sensitivity`. Flag-off orgs keep reading project settings on the legacy path; the project-settings field is annotated `// TODO: Remove this after releasing monitors for everybody` and cleaned up post-rollout alongside the other replaced settings.

The provisioned default is `DEFAULT_ESCALATION_SENSITIVITY_K`, but it stays **user-tunable**: editing the configurable values of a system monitor's alerts is permitted (only their structure is locked), so the "Issue escalating" monitor's `sensitivity` can be adjusted from its details panel. This preserves the per-project tuning that `projects.settings.escalation.sensitivity` offered today, just relocated onto the monitor.

Wiring note: the detector lives in `@domain/issues` (`check-issue-escalation`), so the flag-on path resolves the project's system issue-escalating monitor alert to read its `sensitivity`. That coupling lands in M6.

### Saved-search alerts (new path)

The same data shape on `alert_incidents` that powers `issue.escalating` (polymorphic `entrySignals`, `exitEligibleSince`, `startedAt` backtracking) is reused. The evaluator is different — instead of the seasonal anomaly detector, a pure count-vs-threshold function — and there are three distinct state machines on top of it (one per saved-search alert kind). We deliberately do **not** abstract over both issues and saved searches at the use-case level: `issue.escalating` reads seasonal grids from ClickHouse with very different inputs from saved-search, and forcing one abstraction would obscure rather than clarify. Code organisation: parallel implementations sharing only the storage shape and trigger plumbing.

#### Trigger paths

Same pattern as today's `issue.escalating`:

1. **Trace-end-driven, throttled** — trace-end publishes `monitors:checkSavedSearchMonitors` for the org with the queue layer's `throttleMs` option (`throttleMs: 5 * 60 * 1000`). Within the throttle window only one job runs, regardless of trace volume. The handler iterates every active saved-search-source monitor alert in the org and runs the evaluator for each.
2. **Periodic sweep cron, 5-minute interval** — mirrors `sweep-escalating-issues.ts`. Scans all sustained saved-search incidents with `endedAt IS NULL` plus active threshold/match alerts and runs the same handler. This catches closes for low-traffic orgs (no trace-end retriggers the throttled task) and is the safety net for opens. 5 minutes = the minimum `window` for escalating alerts; coarser cadence would delay close transitions by more than one tick.

#### Shared evaluator

```ts
// packages/domain/monitors/src/use-cases/evaluate-saved-search-alert.ts
//
// Pure function (modulo IO for trace queries + baseline resolution).
// Returns the verdict and the supporting numbers so the state-machine
// callers can snapshot them onto entrySignals.
export const evaluateSavedSearchAlert = (input: {
  alert: MonitorAlert
  monitor: Monitor              // for monitor.createdAt (threshold.absolute)
  now: Date
}): Effect.Effect<{
  isMet: boolean
  count: number                 // matches in the "current" window
  threshold: number             // resolved threshold at this `now`
  firstMatchInWindow: Date | null  // for startedAt backtracking
  baselineCount?: number        // present when condition mode is multiplier
}, ...>
```

What the evaluator does, per alert kind:

**`savedSearch.threshold`, absolute mode** ("100 times")
1. `count = matches in [monitor.createdAt, now]` (cumulative since monitor creation).
2. `threshold = condition.threshold.count`.
3. `isMet = count >= threshold`.

First, **resolve the baseline into a concrete `[from, to]` window** of a known length. Both kinds use the same `lookback` duration `L`; only the offset differs:
- `average` → window `[now - L, now]`, length `L`.
- `period` → the equal-length period immediately before now: `[now - 2L, now - L]`, length `L` (e.g. `L = 1 day` → "yesterday"; `L = 7 days` → "the previous week"). Trailing offset, not midnight-aligned — avoids timezone/boundary handling while matching "yesterday"/"last week" intuitively.

**`savedSearch.threshold`, multiplier mode** ("3 times more than the average of the last 7 days")
1. `currentWindow = 5 minutes` (= the firing throttle, hardcoded; no user-configurable "current window" field).
2. `count = matches in [now - 5min, now]`.
3. `baselineCount = matches in the resolved baseline window`; `baselineLength` = that window's length.
4. Normalise the baseline to a 5-minute slice:
   `normalisedBaseline = baselineCount × (5min / baselineLength)`.
5. `threshold = factor × normalisedBaseline`.
6. `isMet = count >= threshold`.

**`savedSearch.escalating`, absolute mode** ("2000 times for at least 5 minutes")
1. `count = matches in [now - condition.window, now]`.
2. `threshold = condition.threshold.count`.
3. `isMet = count >= threshold`.

**`savedSearch.escalating`, multiplier mode** ("2 times more than the average of the last 7 days, sustained for at least 1 hour")
1. `count = matches in [now - condition.window, now]`.
2. `baselineCount = matches in the resolved baseline window`; `baselineLength` = that window's length.
3. `normalisedBaseline = baselineCount × (condition.window / baselineLength)`.
4. `threshold = factor × normalisedBaseline`.
5. `isMet = count >= threshold`.

**`expected` mode** ("2 times more than expected", optionally "sustained for at least X" on escalating)

There's no fixed baseline window — the threshold is the *learned* expectation for the current window's position in the day/week, from the same seasonal-grid detector that powers `issue.escalating` (`evaluateSeasonalEscalation`):
1. `currentWindow` = 5 min (threshold) or `condition.window` (escalating).
2. `count = matches in [now - currentWindow, now]`.
3. Ask the detector for the expected count + tolerance band at `now`'s day-of-week × hour-of-day, scaled to `currentWindow`, tuned by `sensitivity` (default `DEFAULT_ESCALATION_SENSITIVITY_K`).
4. `threshold` = the detector's anomaly threshold; `isMet = count >= threshold`.
5. `entrySignals` snapshots the seasonal signals at entry, exactly as `issue.escalating` does today, so the close-side re-evaluates against the frozen expectation.

> The precise mapping of the user-facing "N times more than expected" amount onto the detector's `sensitivity` (σ-multiplier `k`) is finalised in M7, when `evaluateSeasonalEscalation` is wired for saved searches. The data model only needs `sensitivity` here.

**`savedSearch.match`**: TBD — semantics open (see "Open questions"). The look-back window is the throttle interval (5 minutes).

##### Why this multiplier math

For multiplier mode the natural-language form is "*current activity* is N times the *baseline activity*". The two sides have to be expressed in the same units (counts per the same time slice) to compare — otherwise "3× the last 7 days" against "the last 5 minutes" would always be met if you compared raw counts (7-day count vastly exceeds 5-min count). The normalisation step `baselineCount × (currentWindow / baselineLength)` projects the baseline into a current-window-sized slice, giving an apples-to-apples comparison. Note this is exactly why `average` is "an average": dividing the baseline-window total by its length yields the average per-current-window rate.

Worked example for `savedSearch.threshold, multiplier`, "3 times more than the average of the last 3 days":

- Last 3 days produced 8,640 matches → 2 matches per 5-min on average.
- `normalisedBaseline = 8,640 × (5min / 3 days) = 10` (matches per 5-min).
- `threshold = 3 × 10 = 30`.
- Last 5 min produced 7 matches → `isMet = (7 >= 30) = false`. No fire.
- A spike of 35 matches in 5 min would fire (`35 >= 30`).

Worked example for `savedSearch.escalating, multiplier`, "2 times more than yesterday for at least 1 hour":

- Yesterday produced 1,200 matches → 50 per hour.
- `normalisedBaseline = 1,200 × (1hr / 24hr) = 50` (matches per hour).
- `threshold = 2 × 50 = 100`.
- Last 1 hour produced 110 matches → `isMet = true`. Open the incident; dwell-on-exit also = 1 hour.

The multiplier snapshot stored in `entrySignals` at the open transition (`evaluatedThreshold`, `baselineCount`, `baseline`) lets the close-side re-evaluate with the *same* baseline number — preventing the open incident's own elevated counts from drifting the threshold sideways. We compare the *current* count (which is recomputed each tick) against the *frozen* threshold.

#### State machine — `savedSearch.threshold`

Two distinct sub-behaviours by mode:

**Absolute mode (one-time):**

```
At evaluation:
  if there exists any alert_incidents row with monitor_alert_id = A:
    SHORT-CIRCUIT. This alert has already fired once and is durably spent.
    No further evaluation, no rearm.
  else if evaluateSavedSearchAlert(...).isMet:
    INSERT alert_incidents:
      startedAt        = firstMatchInWindow ?? now
      endedAt          = startedAt   (point-in-time, immediate close)
      monitorAlertId   = A.id        (owning monitor resolved via join)
      condition        = snapshot of A.condition
    emit IncidentCreated (which is also IncidentClosed for point-in-time)
  else:
    no-op
```

The "any prior incident" check uses `alert_incidents_monitor_alert_idx`. Read-then-insert is wrapped in a transaction with `SELECT … FOR UPDATE` on the `monitor_alerts` row to absorb at-least-once worker retries.

**Multiplier mode (can re-fire, silent close):**

```
At evaluation:
  let v    = evaluateSavedSearchAlert(...)
  let open = alert_incidents WHERE monitor_alert_id = A.id AND endedAt IS NULL

  if open is null and v.isMet:
    // RISING EDGE — fire
    INSERT alert_incidents:
      startedAt        = v.firstMatchInWindow ?? now
      endedAt          = null      // stays open while condition holds
      monitorAlertId   = A.id      (owning monitor resolved via join)
      condition        = snapshot of A.condition
      entrySignals     = { evaluatedThreshold: v.threshold,
                           baselineCount:     v.baselineCount,
                           baseline:          A.condition.threshold.baseline }
    emit IncidentCreated   // single point-in-time notification

  else if open is not null and not v.isMet:
    // SILENT CLOSE — no notification
    UPDATE alert_incidents SET endedAt = now WHERE id = open.id

  // else: open and still met (no-op), or not open and not met (no-op)
```

The lack of an `IncidentClosed` emit on the silent-close branch is what makes this point-in-time from the user's perspective — they get one notification at the rising edge and nothing else. The `endedAt = null` window is internal state for rearm tracking, not a separate notification surface.

The incidents panel will render an open multiplier-threshold incident as "Ongoing since X". That's a deliberate UX choice — the spike is still happening; the alert just doesn't keep nagging about it.

#### State machine — `savedSearch.escalating` (sustained)

Mirrors `issue.escalating`:

```
At evaluation:
  let v = evaluateSavedSearchAlert(...)
  let open = alert_incidents with monitor_alert_id = A.id,
                                  endedAt IS NULL
  if open is null and v.isMet:
    // OPEN TRANSITION
    INSERT alert_incidents:
      startedAt      = v.firstMatchInWindow ?? now
      endedAt        = null
      monitorAlertId = A.id        (owning monitor resolved via join)
      condition      = snapshot of A.condition
      entrySignals = {
        evaluatedThreshold: v.threshold,
        baselineCount: v.baselineCount,         // present for multiplier
        baseline: A.condition.threshold.baseline,  // multiplier only
      }
      exitEligibleSince = null
    emit IncidentCreated

  else if open is not null and v.isMet:
    if open.exitEligibleSince is not null:
      // condition came back, cancel the dwell timer
      UPDATE alert_incidents SET exitEligibleSince = null

  else if open is not null and not v.isMet:
    if open.exitEligibleSince is null:
      // EXIT-ELIGIBLE TRANSITION
      UPDATE alert_incidents SET exitEligibleSince = now
    else if now - open.exitEligibleSince >= A.condition.window:
      // CLOSE TRANSITION
      UPDATE alert_incidents SET endedAt = now
      emit IncidentClosed
```

Notes:

- **Multiplier baseline is frozen at entry.** The threshold value (and the supporting baselineCount) is snapshotted into `entrySignals` on the open transition. The close-side does NOT re-resolve `factor × baseline` at evaluation time — it compares `v.count >= entrySignals.evaluatedThreshold`. This prevents the open incident's own elevated counts from polluting a sliding baseline and pinning the incident open.
- **No 72h backstop.** Saved-search conditions are deterministic and user-configured; if the user said "alert me when 5xx > 100 for 1 hour" and it's been holding for a week, that's the system working as designed.
- The "alert is met" semantics for sustained incidents are entirely on the count window, not the dwell — the dwell only applies to the exit transition. This is what handles your reconnection-spike concern: a 1-second burst doesn't trip a 5-minute window because at the next evaluation tick the burst is already aged out of the rolling count.

#### State machine — `savedSearch.match`

The simplest of the three — no new state, no prior-incident lookup, the queue's `throttleMs` is the entire mechanism:

```
At evaluation (handler invoked at most every 5 min per org via throttleMs):
  let v = evaluateSavedSearchAlert(...)
  // For savedSearch.match: v.count = matches in [now - 5min, now],
  // v.isMet = v.count > 0, v.firstMatchInWindow = timestamp of the
  // first matching trace in the window.

  if v.isMet:
    INSERT alert_incidents:
      startedAt        = v.firstMatchInWindow
      endedAt          = startedAt       (point-in-time, immediate close)
      monitorAlertId   = A.id            (owning monitor resolved via join)
      condition        = null            (no condition for this kind)
      severity         = A.severity
    emit IncidentCreated
  else:
    no-op
```

Behaviour over time:

| Activity pattern | What the user sees |
|---|---|
| A burst of 500 matches arriving simultaneously | 1 alert. The 499 redundant `monitors:checkSavedSearchMonitors` publishes from the trailing traces are dropped by the queue's throttle for that 5-min window. |
| Continuous matching activity over 30 minutes | 6 alerts, one every 5 minutes. Literal throttle keeps surfacing that activity is still ongoing. |
| Sporadic matches with sub-5-min gaps | One alert per 5-min window that contains ≥1 match. |
| Long quiet period, then activity resumes | Fresh alert on the first trace-end after the throttle key opens up. |

The trade-off vs a "burst detection" alternative (one alert per activity burst with ≥5-min quiet boundary): literal throttle is louder for continuous activity but is dramatically simpler and uses no new state. The user-docs page calls this trade-off out explicitly so customers know what to expect.

No new column on `monitor_alerts`. No prior-incident lookup. The throttle-key collision on the queue is doing all the work.

#### Source cascade

When an issue or saved search is deleted:

- A `SourceDeleted` event (or the existing entity-specific deleted events) routes to a new `monitors:onSourceDeleted` task.
- Handler: **soft-deletes** `monitor_alerts` with `(source_type = $1, source_id = $2)` (sets `deleted_at = now()` — never a hard delete, so historical incidents stay attributable). For each affected `monitor_id`: counts remaining active alerts; if zero, soft-deletes the monitor.

System monitors are unaffected because their alerts use `source.id = null`.

### Notification payload extension

The existing `NOTIFICATION_KIND_META` registry (`incident.event` / `incident.opened` / `incident.closed`) is kept as-is — the kinds capture the **shape** of the notification (one-shot vs sustained) and the templates already render whatever the alert kind is. The single change is on the **base payload shape**:

```ts
// packages/domain/notifications/src/entities/notification.ts
const incidentBasePayloadShape = {
  alertIncidentId: cuidSchema,
  sourceType: alertIncidentSourceTypeSchema,
  sourceId: cuidSchema,
  incidentKind: alertIncidentKindSchema,
  severity: alertSeveritySchema,
  /** NEW: monitor attribution, resolved at produce time via `IncidentMonitorReader`. */
  monitorId: cuidSchema.optional(),
  monitorName: z.string().optional(),
  monitorSlug: z.string().optional(),
  /** NEW: snapshot from alert_incidents.condition. */
  condition: alertIncidentConditionSchema.nullable().optional(),
}
```

Templates use the new fields conditionally:

- When `monitorName` is set, the email, in-app, **and Slack** templates show a "Created by monitor <name>" line; email + Slack deep-link to the monitor details panel via `monitorSlug` (the in-app card already links to the incident source, so it renders the name as text). The producer resolves name + slug into the payload at request time, so no extra round-trip from the renderer.
- When `condition` is set, the templates show a humanised summary of the alert: "Alert: when matches > 100 in 5 minutes". Driven by the shared `formatHumanReadableAlert` helper.

For incidents that were created on the legacy path (no monitor), both fields are absent and the templates fall back to today's copy.

## Web UI

### Left navbar

A new `Monitors` item under `apps/web/src/routes/_authenticated/projects/$projectSlug.tsx` (`ProjectSidebar`), positioned between **Issues** and **Datasets**. Suggested icon: `RadarIcon`. Active when `pathname.startsWith("/monitors")`. Gated by `useHasFeatureFlag("monitors")`.

### Monitors dashboard route

`apps/web/src/routes/_authenticated/projects/$projectSlug/monitors/index.tsx`. Mirrors the issues dashboard structurally:

- Layout: `ListingLayout` with `Layout.Content` + `Layout.Aside`.
- Top toolbar: debounced search input (URL param `q`) + primary "+ New monitor" button (kept on the dashboard for discoverability even though the most common entry-point is the saved-searches dropdown).
- Table: `InfiniteTable` with offset/limit pagination (50 per page) — infinite-scroll UX matching the issues table.
- URL params: `monitorSlug` (selected), `q` (search), `sortBy` (default `lastIncident`), `sortDirection` (default `desc`).

#### Empty state

Mirrors `issues-empty-state.tsx`. In practice rarely seen post-backfill, since every project has the three system monitors. Still present for the edge case (provisioning lag, flag-off projects) and for visual consistency.

#### Columns

| Column | Sortable | Behaviour |
|---|---|---|
| Name | yes | Truncated. `<LatitudeLogo />` prepended when `system === true`, mirroring the annotation-card pattern. |
| Status | yes | `<Status variant="primary">Live</Status>` when `mutedAt = null`; `<Status variant="muted">Muted</Status>` otherwise. |
| Last incident | yes | Empty when no incidents. Otherwise: warning badge "Closed Xh ago" if the latest incident has `endedAt != null`; destructive badge "Ongoing since Xh" if `endedAt = null`. Uses `relativeTime` from `@repo/utils`. |
| Actions | no | A trailing 3-dots `optionsColumn` menu (the home for all monitor management): **Mute/Unmute** (behind `MonitorMuteConfirmModal`), and **Rename** / **Delete** (user monitors only — disabled for system; the rename modal + delete confirmation are wired in M5). |

**Ordering.** Name / Status / Last incident are all sortable, applied client-side over the loaded rows, with the selected sort persisted in the `monitorsSort` query param. The default is **last incident descending** (monitors with no incident sort last); `createdAt` desc then `id` are the fixed secondary/tertiary tiebreaks. **System monitors are not pinned** — they flow with the rest. The list read surfaces each monitor's latest-incident timestamp (`MonitorRepository.list` → `lastIncidentByMonitorId`), which both orders the page at the DB level and populates the `lastIncident` column. (Status sort ranks Live above Muted, so "desc" leads with live monitors.)

The "Notifications" column from earlier drafts is gone — notifications are not per-monitor and there's nothing meaningful to surface here.

Row click toggles `monitorSlug`. The selected row gets `activeRowKey` highlight. The actions cell stops click propagation so opening the menu doesn't open the panel.

### Monitor details panel

`apps/web/src/routes/_authenticated/projects/$projectSlug/monitors/-components/monitor-detail-drawer.tsx`. Mirrors `issue-detail-drawer.tsx`. **A single mode** — monitor management (mute / rename / delete) lives on the dashboard list's 3-dots menu, not the panel. There is no `useEditableText` in the repo, so rename is a modal off that menu (M5), not in-place editing here.

- `DetailDrawer` with `storeKey="monitor-detail-drawer-width"`. `actions` = next/prev nav chevrons (`Alt+ArrowUp/Down`, `J`/`K`); `rightActions` = a Mute/Unmute button (behind `MonitorMuteConfirmModal`), mirroring where issue details put their lifecycle actions. No delete button.
- Header body (mirrors `issue-detail-drawer`): bordered block with `Text.H4M` title, `Text.H5` muted description, then a row with `<CopyableText value={monitor.slug} size="sm" />` plus a **"System" tag** (LatitudeLogo + "System", styled like a `TagBadge`) for system monitors and a "Muted" badge when muted. Plain text, no edit affordance.
- Body sections (collapsible):
  - **Alerts** — vertical stack of cards showing `formatHumanReadableAlert` (rendered server-side onto the alert record) + kind/severity. **Read-only in M4**; editing the configurable values (the `issue.escalating` sensitivity + saved-search forms via the shared alert-form, saving through `updateMonitorAlertUseCase`) and add/remove (`createMonitorAlert` / `deleteMonitorAlert`) land in **M5**. `null`-condition cards (`issue.new`, `issue.regressed`) stay read-only regardless.
  - **Incidents** — embedded `InfiniteTable` of incidents for this monitor, **keyset-paginated** (`useMonitorIncidents` → `useInfiniteQuery`, cursor over `(started_at, id)`). Incidents are append-heavy and unbounded over time, so keyset avoids offset's scan-and-discard and the page-shift that new incidents would cause; backed by the composite `alert_incidents_monitor_alert_idx (monitor_alert_id, started_at DESC, id DESC)`.

#### Incidents section table

Columns:

- **Start time** (sortable, default desc)
- **End time** — warning badge "Closed Xh ago" or destructive badge "Ongoing since Xh"
- **Source** — the resolved source name, deep-linked to its dashboard with the entity pre-selected: issue → `/projects/$projectSlug/issues?issueId=<id>`; saved search → `/projects/$projectSlug/search?savedSearch=<slug>` (moves to the traces page once the search bar lands there in M8). `alert_incidents.sourceId` is always set, so there's no "all" case here — that distinction lives on the alert, not the incident. Names are resolved server-side per page (`IssueRepository.findByIds` / `listSavedSearches`); a deleted source falls back to the raw, copyable id.
- **Notified** — success badge "Notified" or muted badge "Muted". Derived from `EXISTS(notifications row with idempotency_key IN (...))` — see the data model section.

### Create monitor modal

Opened from the dashboard "+ New monitor" button or from the saved-searches dropdown on the traces/sessions page. Fields:

- Name (required, 1..128 chars).
- Description (optional, multiline).
- Alerts — vertical card stack. Starts with one alert card pre-populated:
  - If opened from the saved-searches dropdown: pre-populated to `savedSearch.match` with the saved search selected.
  - If opened from the dashboard button: pre-populated to `savedSearch.match` with an empty source picker the user must fill.
- The kind dropdown is limited to `USER_CREATABLE_ALERT_KINDS` (today: three `savedSearch.*` kinds).

At submit time, the server-side create use-case re-validates `every alert.kind in USER_CREATABLE_ALERT_KINDS` and rejects any attempt to bypass.

#### Alert card form

Per card:

1. **Kind dropdown** — humanised labels for the three saved-search kinds.
2. **Source** — a searchable `Combobox` listing the project's saved searches. **No "All saved searches" option** — the user must pick one. If the project has no saved searches, an inline "Create a saved search" link redirects to `/traces` with the save flow ready.
3. **Condition** — rendered conditionally on kind:
   - `savedSearch.match`: no condition fields.
   - `savedSearch.threshold` and `savedSearch.escalating`: the threshold form (below).
4. **Severity** — `low | medium | high`.

#### Threshold/window form

Expresses `AlertCountThreshold` + (for escalating) `window` in two rows:

- Row 1 (both threshold and escalating): `"Alert when traces are detected"` + count/amount input + `Select` `["times", "times more than"]`. When "times more than", a second `Select` picks what to compare against. Three groups: **average** (`"the average of the last hour"`, `"… 24 hours"`, `"… 7 days"`), **previous period** (`"yesterday"`, `"the previous week"`), and **expected** (`"expected"`). "The average of the last 7 days" is the default. Picking **average**/**previous period** sets `mode: "multiplier"` and the amount input is the `factor`; picking **expected** sets `mode: "expected"` and the same amount input becomes the `sensitivity` (1–6). The expected option carries an info tooltip (below) explaining it's a dynamically-learned baseline.
- Row 2 (`savedSearch.escalating` only): `"for at least"` + duration input + `Select` `["minutes", "hours", "days"]`. This is the `window` field. Minimum 5 minutes.

The form binds bidirectionally to the discriminated union. `formatHumanReadableAlert(alert)` renders the union back to text — used in the card preview, table tooltips, and notification templates.

Tooltip copy lives next to every field (see the M5 task list). The intent is that a user reading just the form, with no docs open, can correctly predict what each combination of fields will do.

### Saved searches integration in traces / sessions pages

After the standalone `/search` page is removed (M8) and its UI folds into the `/` page's existing Sessions/Traces tabs:

- The `/` page (`apps/web/src/routes/_authenticated/projects/$projectSlug/index.tsx`) already routes between `TracesView` and `SessionsView` via the `activeTab` query param. M8 adds the `<SearchInput>` to its `Layout.Actions` row so the bar is visible regardless of which tab is active. (Filters and time range already live there.)
- A new `<SavedSearchSelector>` dropdown sits immediately left of `<SearchInput>`. It contains a search filter, the project's saved searches list, and a `"Save current search…"` footer.
- A `<SaveOrUpdateSearchButton>` sits immediately right of `<SearchInput>`:
  - Hidden when no query / no filters / no saved search selected.
  - "Save search" when query+filters present but no `savedSearch` slug in the URL.
  - "Update saved search" when a `savedSearch` is selected and active filters/query differ from the stored ones.
  - Disabled when the selected saved search matches the active state exactly.
- Each saved-search row in `<SavedSearchSelector>` exposes:
  - A delete button.
  - "Create monitor" (opens the create modal pre-populated with this saved search) or "Edit monitor" (opens the existing monitor's details panel via cross-route navigation) — the dropdown row knows whether a monitor referencing this saved search by `source.id` already exists.

The saved-search assign-user UI is removed. `assignedUserId` and `createdByUserId` columns drop in the same migration.

### Human-readable alert summaries

`formatHumanReadableAlert(alert)` (in `packages/domain/monitors/src/helpers.ts`) returns one sentence per alert. Examples:

All sentences start with "Alerts" (never "Alert me"); saved-search alerts speak of **traces** being **detected** (not matches "occurring"), and the saved search itself is humanised by the caller via `context.savedSearchName`.

| Alert | Output |
|---|---|
| `issue.new`, source `all` | `"Alerts each time a new issue is detected."` |
| `issue.regressed`, source `all` | `"Alerts each time a resolved issue is detected again."` |
| `issue.escalating`, source `all` | `"Alerts when an ongoing issue is being detected more than expected."` |
| `savedSearch.match`, search `"5xx"` | `"Alerts each time a new trace matching '5xx' is detected."` |
| `savedSearch.threshold`, abs 100 | `"Alerts when traces matching '5xx' are detected 100 times."` |
| `savedSearch.threshold`, mult 3× average / last 7 days | `"Alerts when traces matching '5xx' are detected 3 times more than the average of the last 7 days."` |
| `savedSearch.threshold`, mult 2× of yesterday | `"Alerts when traces matching '5xx' are detected 2 times more than yesterday."` |
| `savedSearch.threshold`, expected (sensitivity 2) | `"Alerts when traces matching '5xx' are detected 2 times more than expected."` |
| `savedSearch.escalating`, abs 2000, window 5m | `"Alerts when traces matching '5xx' are detected 2000 times, sustained for at least 5 minutes."` |
| `savedSearch.escalating`, mult 2× average / last 7 days, window 1h | `"Alerts when traces matching '5xx' are detected 2 times more than the average of the last 7 days, sustained for at least 1 hour."` |
| `savedSearch.escalating`, expected (sensitivity 3), window 1h | `"Alerts when traces matching '5xx' are detected 3 times more than expected, sustained for at least 1 hour."` |

Tests cover the matrix. The helper is shared between the API documentation entity (sentence appears in OpenAPI examples), the frontend, and notification templates (rendered into in-app/email when `condition` is set).

**Kind labels** (the short title per kind — "Issue discovered", "Issue regressed", "Issue escalating", "Search match", "Search threshold", "Search escalating") have a single source of truth in `ALERT_INCIDENT_KIND_LABEL` (`@domain/shared`), consumed by the monitor panel, the incident-chart markers, and the email/Slack notification templates so the same kind never shows two different names.

## API / SDK / MCP

### Endpoints (under `/v1/projects/{projectSlug}/monitors`)

Monitor CRUD and monitor-alert CRUD are separate operation families.

| Method | Path | Operation id |
|---|---|---|
| GET | `/` | `listMonitors` |
| POST | `/` | `createMonitor` |
| GET | `/{monitorSlug}` | `getMonitor` |
| PATCH | `/{monitorSlug}` | `updateMonitor` |
| DELETE | `/{monitorSlug}` | `deleteMonitor` |
| GET | `/{monitorSlug}/alerts` | `listMonitorAlerts` |
| POST | `/{monitorSlug}/alerts` | `createMonitorAlert` |
| GET | `/{monitorSlug}/alerts/{alertId}` | `getMonitorAlert` |
| PATCH | `/{monitorSlug}/alerts/{alertId}` | `updateMonitorAlert` |
| DELETE | `/{monitorSlug}/alerts/{alertId}` | `deleteMonitorAlert` |
| GET | `/{monitorSlug}/incidents` | `listMonitorIncidents` |
| POST | `/{monitorSlug}/mute` | `muteMonitor` |
| POST | `/{monitorSlug}/unmute` | `unmuteMonitor` |

- **Alert reads are projections, not a domain read path.** The domain has no separate "read alert" use-case — monitors are always read with their alerts baked in (`getMonitorBySlugUseCase`). `listMonitorAlerts` / `getMonitorAlert` exist only at the API layer, for SDK/MCP surface completeness and consistency: each reads the monitor via the existing use-case and projects `.alerts` (404 on an `alertId` not present). They add no extra query and no new domain code.

- **Monitor CRUD.** `createMonitor` takes the monitor metadata + a non-empty list of alerts (each created through `createMonitorAlert` internally); it rejects `kind ∉ USER_CREATABLE_ALERT_KINDS`, `system: true`, and saved-search alerts without a `source.id`. `updateMonitor` edits **metadata only** (name + description) and rejects `system === true`. `deleteMonitor` soft-deletes the monitor and cascades `deleted_at` to its alerts; rejects `system === true`. `mute` / `unmute` are allowed on both modes.
- **Monitor-alert CRUD.** `createMonitorAlert` adds one alert (rejects `system` monitors, enforces the user-creatable allowlist + `source.id`); `deleteMonitorAlert` removes one (soft-delete; rejects `system` monitors; can't empty the active alert list). `updateMonitorAlert` updates an existing alert's `kind` / `source` / `condition` / `severity` in place. On a **user** monitor the `kind` may change to another user-creatable kind (the caller supplies the matching `source`/`condition`; the form resets the condition fields, since each kind takes a different shape; `source.type` stays fixed by the target kind). On **system** monitors it's the only permitted alert mutation, and only an existing alert's configurable condition values may change (kind / source / severity / setting a condition on a no-condition kind are rejected). For the system "Issue escalating" monitor this is how `sensitivity` is tuned.
- Field descriptions on the OpenAPI schemas are rich enough to render meaningfully as MCP tool descriptions (the same descriptions propagate to the TS SDK via codegen).

### `assign` endpoint removal

`POST /v1/projects/{projectSlug}/searches/{searchSlug}/assign` is removed in M8 alongside the column drops. No SDK back-compat shim; the SDK gets a single regen at M9.

### SDK + MCP regeneration

Per the project convention, regen is batched and happens once at the end of M9, not per PR. Steps:

1. `pnpm openapi:emit`
2. `pnpm mcp:emit`
3. `pnpm --filter @latitude-data/sdk generate`
4. Bump SDK version in `packages/sdk/package.json` + CHANGELOG entry.

## Feature flag

Identifier: `monitors`. Added to `FEATURE_FLAGS` in `packages/domain/feature-flags/src/registry.ts`:

```ts
"monitors": {
  emoji: "📡",
  name: "Monitors",
  description: "Unified alerting surface (per-monitor lifecycle, with notification delivery routed through the existing org/project notification settings).",
}
```

### Backend gating strategy

- The new path is **additive**: the same alert-incidents worker keeps the legacy code path and adds the monitor lookup behind a per-org `hasFeatureFlagUseCase({ identifier: "monitors" })` check.
- Flag off: `alert_incidents.monitorAlertId = null`, `condition = null`. The project-level gate (`projects.settings.notifications.incidents`) applies in the producer.
- Flag on: the worker resolves matching alerts and writes one incident per alert with `monitorAlertId` set and `condition` snapshotted. The producer's mute gate kicks in for monitor-driven incidents.
- TODO comments — `// TODO: Remove this after releasing monitors for everybody` — placed at:
  - `projects.settings.notifications.incidents` definition (`packages/domain/shared/src/settings.ts`) and every read site.
  - The three issue-notification checkboxes on `/settings/issues` page (`apps/web/src/routes/_authenticated/projects/$projectSlug/settings/issues.tsx`).
  - The standalone `/search` route components.
  - `saved_searches.assignedUserId` / `createdByUserId` schema columns and every read/write.
  - The legacy non-monitor branch in `request-incident-notifications`.

### Frontend gating

- Sidebar nav item hidden when the flag is off.
- `/projects/$slug/monitors` route renders a "Not available" splash when accessed directly without the flag.
- The `monitors` flag itself stays in place after M10 — only the three stale flags (`email-notifications`, `notifications`, `timeline-incidents`) are removed there. The `monitors` flag's own cleanup is a future post-rollout PR.

## Stale flag removal

In M10, three flags are removed and every reference cleaned up:

| Flag | Removal action |
|---|---|
| `email-notifications` | Drop the worker org-level gate in `notifications.ts`. Drop the frontend query in `account.tsx`. |
| `notifications` | Drop `<NotificationBell>` gate. Drop the issues settings page gate. |
| `timeline-incidents` | Drop `use-show-incidents-overlay.ts` gate so the overlay always shows. |

Cleanup of the override table (`DELETE FROM organization_feature_flags WHERE identifier IN (...)`) runs as a one-shot SQL command (manual, not a Drizzle migration).

## Provisioning system monitors

### On project creation

The `ProjectCreated` event already fans out to a `projects:provision` task in `apps/workers/src/workers/projects.ts`. We extend that task to call `provisionSystemMonitorsUseCase(projectId)` after `provisionFlaggers()`.

The system monitor definitions are hardcoded in `packages/domain/monitors/src/system-monitors.ts`. Severity is intentionally **not** stored on the definition — it's a pure function of `kind` (`SEVERITY_FOR_KIND` in `@domain/shared`), applied by the provision use-case when it materialises the entity. This keeps the system monitors and the legacy issue-event path from reporting different severities for the same kind (`issue.new` → `medium`, `issue.regressed` / `issue.escalating` → `high`).

```ts
export const SYSTEM_MONITOR_DEFINITIONS = [
  {
    slug: "issue-discovered",
    name: "Issue discovered",
    description: "Notifies each time a new issue is detected.",
    alerts: [{ kind: "issue.new", source: { type: "issue", id: null }, condition: null }],
  },
  {
    slug: "issue-regressed",
    name: "Issue regressed",
    description: "Notifies each time a resolved issue is detected again.",
    alerts: [{ kind: "issue.regressed", source: { type: "issue", id: null }, condition: null }],
  },
  {
    slug: "issue-escalating",
    name: "Issue escalating",
    description:
      "Notifies when an ongoing issue is being detected more than expected.",
    alerts: [
      {
        kind: "issue.escalating",
        source: { type: "issue", id: null },
        // Sensitivity travels with the monitor (moved off projects.settings).
        // DEFAULT_ESCALATION_SENSITIVITY is the single source of truth in
        // @domain/shared; @domain/issues re-exports it as DEFAULT_ESCALATION_SENSITIVITY_K.
        condition: { kind: "issue.escalating", sensitivity: DEFAULT_ESCALATION_SENSITIVITY },
      },
    ],
  },
] as const
```

The definitions are source-type-agnostic at the data-model level — future system monitors of any source type can be added by extending this array.

The provision use-case is idempotent: on re-run (e.g. re-publish of the `provision` task) it inserts only missing slugs.

### Backfill for existing projects

A **data SQL migration** ships in M3, separate from the structural migration that creates the tables in M2. It's deliberately simple: every project gets all three system monitors unmuted, regardless of whether the project had previously disabled any of the three per-kind notification toggles. We do not migrate existing `projects.settings.notifications.incidents.<kind> = false` settings into `mutedAt` — that would couple a hardcoded data migration to a polymorphic JSONB read, and the org-level rollout of the flag is the natural moment for users to re-confirm their preferences via the new Monitors UI.

The migration is a fixed-shape `INSERT … SELECT … WHERE NOT EXISTS` per system slug:

```sql
-- Repeated three times (one per SYSTEM_MONITOR_DEFINITION), with hardcoded
-- values so the migration is self-contained and reproducible.
INSERT INTO latitude.monitors (id, organization_id, project_id, slug, name, description, system, created_at, updated_at)
SELECT
  gen_random_uuid()::text,  -- replaced by the repo's cuid helper at migration time
  p.organization_id,
  p.id,
  'issue-discovered',
  'Issue discovered',
  'Notifies each time a new issue is detected.',
  true,
  now(), now()
FROM latitude.projects p
WHERE NOT EXISTS (
  SELECT 1 FROM latitude.monitors m
  WHERE m.project_id = p.id AND m.slug = 'issue-discovered' AND m.deleted_at IS NULL
);

INSERT INTO latitude.monitor_alerts (id, organization_id, monitor_id, kind, source_type, source_id, condition, severity, created_at)
SELECT
  gen_random_uuid()::text,
  m.organization_id,
  m.id,
  'issue.new',
  'issue',
  NULL,
  NULL,
  'medium',
  now()
FROM latitude.monitors m
WHERE m.slug = 'issue-discovered' AND m.system = true AND NOT EXISTS (
  SELECT 1 FROM latitude.monitor_alerts a WHERE a.monitor_id = m.id
);
-- … and same for "issue-regressed" (condition NULL) and "issue-escalating",
-- whose alert sets condition = '{"kind":"issue.escalating","sensitivity":<DEFAULT_ESCALATION_SENSITIVITY_K>}'::jsonb
-- (the hardcoded default — the migration is self-contained, no read of the
-- soon-to-be-deprecated projects.settings.escalation.sensitivity).
```

The idempotency comes from `NOT EXISTS`. Future projects pick up monitors through the worker hook; the data migration only fills the historical gap.

## Mute behaviour in detail

Single change to `packages/domain/notifications/src/use-cases/request-incident-notifications.ts`:

```ts
// Pseudo-code; actual implementation uses Effect.
const incident = yield* alertIncidents.findById(alertIncidentId)
if (incident.monitorAlertId !== null) {
  // Resolve the owning monitor by joining through the (soft-deletable)
  // alert, so muting still applies to incidents whose firing alert was
  // later removed. A single `findMonitorByAlertId` repo call does the join.
  const monitor = yield* monitors.findByAlertId(incident.monitorAlertId)
  if (monitor !== null && monitor.mutedAt !== null) {
    return { skipped: "monitor-muted" }
  }
}
// existing logic continues unchanged
```

Effects:

- Mute does not stop incident creation. Incidents continue to land in the table and show in the details panel's Incidents section.
- Mute does stop notification rows from being created. The "Notified"/"Muted" badge in the incidents table relies on `EXISTS(notifications row)` and naturally reads "Muted" for rows opened while the monitor was muted.
- Toggling mute back on for an open sustained incident has no retroactive effect — the open-time notification was already skipped, and the close-time notification will be skipped too if mute is still on when the close happens.

**What the mute gate is and isn't**: it short-circuits the producer step before any per-recipient resolution. It is *not* a replacement for user-level per-group prefs (`users.notification_preferences.incidents.email`, etc.) — those continue to apply to monitor-driven incidents downstream of the mute gate. So the layering for a monitor-driven incident is:

1. **Monitor mute** (new) — if the monitor is muted, the entire fan-out is skipped.
2. **Project-level per-kind gate** (`projects.settings.notifications.incidents`) — *skipped* for monitor-driven incidents (`monitorAlertId IS NOT NULL`); the per-kind toggle is conceptually replaced by per-monitor muting.
3. **Per-user-per-group prefs** (`users.notification_preferences.<group>`) — applied as today; a user opted out of the `incidents` group still won't see anything.

For legacy incidents (`monitorAlertId IS NULL`, flag-off orgs), layer 1 is absent and layer 2 applies as before.

## Test strategy (backend only — no frontend tests)

Backend tests follow the testing skill's conventions (PGlite testkit; org/project fixtures from `@repo/testing`):

- **Schema & repository** — round-trip writes; uniqueness on `(project_id, slug) WHERE deleted_at IS NULL`; RLS enforcement (a query without the org context returns nothing).
- **Use-cases** — monitor CRUD: `createMonitor` (rejects empty alerts / non-allowlisted kind / `system: true` / missing saved-search `source.id`), `updateMonitor` (metadata only; `system` rejected), `deleteMonitor` (`system` rejected; cascades to alerts), `mute`/`unmute` (system allowed), list with name search, get by slug, list incidents. Alert CRUD: `createMonitorAlert` / `deleteMonitorAlert` (both reject `system`; allowlist + can't-empty enforced), `updateMonitorAlert` (user monitors may change `kind` to another user-creatable kind; condition-vs-kind + source-type validation; on system only an existing alert's configurable condition values change — kind/source/severity/no-condition rejected).
- **System monitor provisioning** — idempotent re-run; data-migration backfill correctness against `SYSTEM_MONITOR_DEFINITIONS`.
- **Issue-event monitor resolution** — `resolveMonitorsForSourceEvent` returns all-of-type + specific-id matches; flag-on multi-monitor fan-out; flag-off legacy parity.
- **`startedAt` backtracking** — `issue.escalating` incident `startedAt` is the first-bucket-crossing timestamp from the trend window, not now.
- **Mute gate in notifications producer** — muted-monitor incident skips all downstream fan-out; non-muted continues; project-level gates still apply.
- **Condition snapshot on `alert_incidents`** — editing the firing alert mid-incident does not change the row's `condition`.
- **Notification payload** — `monitorId` and `condition` propagate into `incident.event` / `incident.opened` / `incident.closed` payloads when present; absent for legacy incidents.
- **Saved-search firing** — covered in M7 against the actual firing helpers.
- **Source cascade** — delete of issue / saved search soft-deletes matching alerts (incidents stay attributable via the join) and soft-deletes the monitor if its active alert list empties.
- **Human-readable alert formatter** — table-driven test over the matrix above.
- **API endpoints** — request/response contract for the thirteen endpoints; 400s for forbidden combos (kind not in user-creatable allowlist, kind/source.type mismatch, delete on system monitor, empty alerts, adding/deleting alerts on a system monitor, `updateMonitorAlert` changing kind/source on a system monitor).

## Documentation

After M11:

- Non-implementation-plan content of this spec moves to `dev-docs/monitors.md`.
- `specs/monitors.md` is deleted (per the spec → dev-docs promotion convention).
- Cross-links added from `dev-docs/notifications.md` and `dev-docs/reliability.md`.
- No new entry in the `CLAUDE.md` skill glossary — monitors are well-covered by the existing `alerts`, `notifications`, `async-jobs-and-events`, and `architecture-boundaries` skills.

---

## Implementation plan

Each milestone is one branch, one commit, one PR. The branch prefix is `LAT-630/`. PRs are sized to ≤ 3,000 lines of changes excluding Drizzle migrations and auto-generated files (OpenAPI / MCP / SDK output).

Milestones are sequential — do not begin the next until the previous is reviewed, polished, and merged.

The first milestones prioritise **visible progress**: M1 ships the sidebar entry and an empty page; M3 ships three real system monitors on the dashboard; M4 ships a working details panel; M5 ships an end-to-end create flow. The saved-search firing logic and API endpoints come later, once the surface is convincing.

### Milestone 1 — Visual scaffold: feature flag, sidebar entry, empty Monitors page

> Branch: `LAT-630/visual-scaffold` · Estimated size: ~400 lines

**Goal:** A stakeholder enables the `monitors` flag for their org and sees a new "Monitors" item in the project sidebar that leads to an empty page with a "No monitors yet" empty state. Zero backend wiring.

- [x] Register `monitors` in `packages/domain/feature-flags/src/registry.ts`.
- [x] Add the `Monitors` nav item in `apps/web/src/routes/_authenticated/projects/$projectSlug.tsx` (`ProjectSidebar`), positioned between Issues and Datasets, gated by `useHasFeatureFlag("monitors")`.
- [x] Create `apps/web/src/routes/_authenticated/projects/$projectSlug/monitors/index.tsx` with the `ListingLayout` shell, empty toolbar (search input + disabled "+ New monitor" button), and an empty state component (`monitors-empty-state.tsx`).
- [x] Frontend feature-flag gate on the route: "Not available" splash if the flag is off (no longer a borrowable pattern in the codebase — `session-search-v2` was removed in #3320; implement as a small consistent helper).

### Milestone 2 — Backend foundation: schema, entities, repository, list/get use-cases

> Branch: `LAT-630/backend-foundation` · Estimated size: ~2,400 lines (excluding migration SQL)

**Goal:** Domain layer is complete for the read paths. The dashboard table from M1 starts pulling from real (still-empty) data via a server function. No write paths yet; no system-monitor provisioning yet.

- [x] Drizzle structural migration via `pnpm --filter @platform/db-postgres pg:generate monitors-tables`:
  - `monitors`, `monitor_alerts` tables (with RLS enabled + org-isolation policy). `monitor_alerts` carries `deleted_at` (soft delete).
  - `alert_incidents.monitor_alert_id` and `alert_incidents.condition` columns (the owning monitor is NOT denormalised — resolved via join through `monitor_alerts`).
  - Partial index on `(monitor_alert_id)` where non-null; partial `monitor_alerts_source_idx` on live (`deleted_at IS NULL`) rows; non-partial `monitor_alerts_monitor_idx` so the incident join still resolves soft-deleted alerts.
- [x] Drizzle schema files: `packages/platform/db-postgres/src/schema/monitors.ts`, `monitor-alerts.ts`. Update `alert-incidents.ts` for the two new columns.
- [x] Extend shared enums in `@domain/shared`:
  - `alert-incident-kinds.ts` — add savedSearch kinds, `ALERT_INCIDENT_KIND_LIFECYCLE`, `ALERT_INCIDENT_KIND_SOURCE_TYPE`, `USER_CREATABLE_ALERT_KINDS`.
  - New file `alert-incident-condition.ts`: `AlertDuration`, `AlertBaseline` (`average` / `period`), `AlertCountThreshold` (`absolute` / `multiplier` / `expected`), the saved-search threshold + escalating condition variants, and the `issue.escalating` condition (`{ sensitivity? }`) — all in the `AlertIncidentCondition` discriminated union. `escalationSensitivitySchema` is shared between the `expected` mode and the `issue.escalating` condition.
- [x] Create `packages/domain/monitors/` package:
  - `src/entities/monitor.ts` — `Monitor`, `MonitorAlert` + Zod schemas + verbatim entity-level JSDoc.
  - `src/ports/monitor-repository.ts` — `MonitorRepository` service.
  - `src/use-cases/list-monitors.ts` — pagination + `LIKE` name search.
  - `src/use-cases/get-monitor-by-slug.ts`.
  - `src/use-cases/get-monitor-incidents.ts` — proxy to `alert-incidents` `listByMonitorId` (joins through `monitor_alerts`), with the "notified" derivation (batched idempotency-key lookup against `notifications`).
  - `src/helpers.ts` — `formatHumanReadableAlert`.
- [x] Implement `MonitorRepositoryLive` in `packages/platform/db-postgres/src/repositories/monitor-repository.ts` (active-alert reads filter `deleted_at IS NULL`).
- [x] Extend `AlertIncidentRepository`: `listByMonitorId` (joins through `monitor_alerts`, includes soft-deleted alerts) + `listByMonitorAlertId` (direct lookup), both **keyset-paginated** over `(ended_at, id)` ordered `ended_at DESC NULLS FIRST, id DESC` (ongoing incidents first, then most-recently-resolved). Add `findExistingIdempotencyKeys` to `NotificationRepository` for the "notified" derivation.
- [x] Web side: `apps/web/src/domains/monitors/monitors.functions.ts` + `monitors.collection.ts`. `useMonitors` (offset infinite) and `useMonitorIncidents` (cursor infinite) are `useInfiniteQuery` exposing an `InfiniteTableInfiniteScroll` handle; the dashboard `InfiniteTable` is wired to it. Columns render correctly against empty data.
- [x] Backend tests: schema constraints (incl. slug-reuse after soft-delete), RLS, repository (incl. soft-deleted-alert join + exclusion), use-cases, formatter.

### Milestone 3 — System monitor provisioning + data migration

> Branch: `LAT-630/system-monitors` · Estimated size: ~1,800 lines

**Goal:** Every project has the three system monitors. New projects get them via the provisioning hook; existing projects get them via a data SQL migration. The dashboard shows three live system monitors with their correct names and empty last-incident state, and a row click opens a stub details panel.

> The `issue.escalating` `startedAt` backtracking originally bundled here moved to **M6** — it changes the existing (non-flag-gated) escalation path and reuses the seasonal trend/threshold queries, so it's cohesive with the issue-event work there. See M6.

- [x] `packages/domain/monitors/src/system-monitors.ts` — `SYSTEM_MONITOR_DEFINITIONS` (slug/name/description + alert `kind`/`source`/`condition`). Severity is **not** stored on the definition: it's a pure function of `kind` (`SEVERITY_FOR_KIND`), applied when the use-case materialises the entity, so system monitors and the legacy issue-event path can't report different severities for the same kind (escalating = `high`). The `issue.escalating` alert carries `condition: { kind: "issue.escalating", sensitivity: DEFAULT_ESCALATION_SENSITIVITY }`. `DEFAULT_ESCALATION_SENSITIVITY` now lives in `@domain/shared` (next to `escalationSensitivitySchema`) as the single source of truth; `@domain/issues` re-exports it as `DEFAULT_ESCALATION_SENSITIVITY_K`.
- [x] `provisionSystemMonitorsUseCase({ organizationId, projectId })` — builds the entities and delegates to `MonitorRepository.provisionSystemMonitors`. Always provisions monitors unmuted (no read of existing `projects.settings.notifications.incidents`). Idempotent: the repo inserts each monitor only when no live `(projectId, slug)` row exists (`onConflictDoNothing` against the partial unique index) and inserts alerts only for monitors it actually created, so a re-run returns `[]`.
- [x] Modify `apps/workers/src/workers/projects.ts` (via `services/provisioning.ts`) — call `provisionSystemMonitors` after `provisionFlaggers()`. Runs for **every** project regardless of the `monitors` flag: the rows are inert until the firing/UI gates open, and provisioning up-front makes the eventual flag flip seamless.
- [x] **Data SQL migration** (separate from M2's structural migration, via `pg:generate:custom`): three `INSERT … SELECT … WHERE NOT EXISTS` monitor inserts + three alert inserts covering the historical project set. Idempotent (`NOT EXISTS` on `(project_id, slug)` among live rows for monitors, on `monitor_id` for alerts). All monitors unmuted; existing per-kind notification toggles in project settings are deliberately not consulted. Slugs/names/severities/conditions are hardcoded to mirror `SYSTEM_MONITOR_DEFINITIONS` + `SEVERITY_FOR_KIND`; the `issue.escalating` alert's `condition` is backfilled with the hardcoded default sensitivity (`3`), not read from `projects.settings.escalation.sensitivity`.
- [x] Wire the dashboard's row click to set `monitorSlug` in the URL with a stub placeholder panel (`monitor-detail-drawer.tsx`, named for the real panel that lands in M4).
- [x] Backend tests: provision use-case (entity shape + severity derivation), repository idempotency (PGlite), data-migration shape (per-project fan-out + idempotency, run against the real `migration.sql`).

### Milestone 4 — Monitor details panel: structurally-locked system mode + editable user mode

> Split into two PRs to stay reviewable: **backend mutations** (`LAT-630/monitor-mutations`, done) then the **details-panel UI** (`LAT-630/details-panel`). Combined estimate ~2,600 lines.

**Goal:** Clicking a monitor opens a working details panel with next/prev navigation, mute/unmute (both modes), delete (user mode only), and editable alert configuration values (both modes — the system "Issue escalating" monitor's `sensitivity` is tunable here). The Incidents section is wired to the existing alert-incidents data. The Notified/Muted badge is correctly derived.

Backend mutations (`LAT-630/monitor-mutations`):

- [x] `muteMonitorUseCase`, `unmuteMonitorUseCase` (both modes allowed) + repo `setMuted`.
- [x] `deleteMonitorUseCase` — rejects on `system === true` (`SystemMonitorForbiddenError`); repo `softDelete` cascades `deletedAt` to the monitor's live alerts so it stops firing while the incident→alert join keeps history attributable.
- [x] `updateMonitorUseCase` — edits **metadata only** (name + description); rejects on `system === true`; validates name length (1–128); regenerates slug (via shared `generateSlug` + repo `countActiveBySlug`) only when the name's normalised form changes. Repo `updateMetadata`.
- [x] `updateMonitorAlertUseCase({ monitorId, alertId, kind?, source?, condition?, severity? })` — the single per-alert update (replaces the old `configureMonitorAlert` + `updateMonitorAlerts` set-replacement). On user monitors `kind` may change to another user-creatable kind (non-creatable target → `ValidationError`); `source.type` stays fixed by the target kind. The resulting `condition` must match the (target) kind (`AlertConditionMismatchError` otherwise); source-type mismatch → `ValidationError`; unknown alert → `MonitorAlertNotFoundError`. On **system** monitors only an existing alert's configurable condition values may change — kind / source / severity / setting a condition on a no-condition kind are rejected (`SystemMonitorForbiddenError`). Repo `updateAlert` sets `kind` / `source_id` / `condition` / `severity`.
- [x] Backend tests: mute/unmute (both modes), delete (system rejection + cascade), metadata update (system rejection, slug regen, cosmetic-rename stability, name validation), configure-alert (kind-mismatch rejected, unknown-alert rejected, `issue.escalating` sensitivity round-trips); repo-level idempotency/RLS via PGlite.

Details-panel UI (`LAT-630/details-panel`):

> Management actions (mute/rename/delete) live on a **3-dots menu on the dashboard list**, not in the panel. The panel itself is a single mode (no system/user branching) — `useEditableText` (which the spec originally assumed) doesn't exist in the repo, so rename is a modal off the list menu, landing in M5.

- [x] Dashboard list **3-dots actions column** (`optionsColumn`): **Mute/Unmute** (functional, behind `MonitorMuteConfirmModal`), plus **Rename** and **Delete** items rendered **disabled** — they only apply to user monitors and are fully wired (rename modal + delete confirmation) in M5.
- [x] `monitor-detail-drawer.tsx` (replaces the M3 stub), mirroring `issue-detail-drawer.tsx`: actions slot = next/prev nav (`Alt+↑/↓`, `J`/`K`) **+ Mute/Unmute** (confirmation); body = name → description → `CopyableText` slug → **Alerts** → **Incidents**. No delete button, no in-place editing.
- [x] **Alerts section read-only in M4**: cards render `formatHumanReadableAlert` (computed server-side onto the alert record to keep `@domain/monitors` out of the client bundle) + kind/severity. Editing configurable values (the `issue.escalating` sensitivity + saved-search forms) lands in M5 with the shared alert-form components.
- [x] **Incidents section**: embedded `InfiniteTable` (`useMonitorIncidents`, keyset). Columns were finalised in Milestone UX to **Status (lifecycle badge) / Source / Duration / Notified**, with the whole row linking to the source (deep-link + name resolution done there); "Started" was dropped.
- [x] `muteMonitor` / `unmuteMonitor` server functions + `useMonitorMuteAction` hook (invalidates the list + detail queries, toasts); shared `MonitorMuteConfirmModal` used by both the list menu and the panel.

### Milestone 5 — Create monitor modal and alert editing

> Branch: `LAT-630/create-and-edit` · Estimated size: ~2,600 lines

**Goal:** Users can create a non-system monitor end-to-end, edit/add/remove a monitor's alerts (the create modal and the panel's alert section share the alert-form components), and rename/delete user monitors from the dashboard 3-dots menu. The `updateMonitorAlertUseCase` backend shipped in M4 (monitor-mutations); M5 builds the editing UI on top of it. All paths constrain to `USER_CREATABLE_ALERT_KINDS`.

- [x] `createMonitorUseCase` — Zod-validated input; inserts the monitor + its alerts atomically, composing `createMonitorAlertUseCase` per alert. Rejects: empty alert list; any alert kind ∉ `USER_CREATABLE_ALERT_KINDS`; `system: true` in the input; saved-search alerts without `source.id`.
- [x] `createMonitorAlertUseCase` — adds a single alert to an existing monitor (also used inside `createMonitor`). Enforces the user-creatable allowlist + kind/source.type match + `source.id` for saved searches. **Rejects `system === true`** — no alert may be added to a system monitor.
- [x] `deleteMonitorAlertUseCase` — soft-deletes a single alert (`deleted_at = now()`, never hard-deleted, so incident history stays attributable). The active alert list cannot become empty (`LastMonitorAlertError`). **Rejects `system === true`** — system monitors are structurally locked.
  > Per-alert *editing* (`updateMonitorAlertUseCase`) shipped in M4; M5 adds the create/delete halves of the alert CRUD family. There is no set-replacement use-case — alert changes are always granular.
- [x] Shared `alert-form` components in `apps/web/src/routes/_authenticated/projects/$projectSlug/monitors/-components/`, reused by both the create modal and the panel Alerts section.
- [x] Saved-search source picker (searchable `Select`) — no "All saved searches" option. A "Create a new saved search" dropdown footer (navigating to `/search`) covers the empty-project and no-results states; the standalone empty-state link was dropped in Milestone UX.
- [x] Threshold + window form for the two complex saved-search kinds, covering all three threshold modes (absolute, multiplier, expected). The baseline `Select` includes the **expected** option, which switches the shared amount input to mean `sensitivity`. `formatHumanReadableAlert` drives the card preview.
- [x] Alert-configuration affordances. M5 originally added a help tooltip on every field; **Milestone UX simplified this**: kind and severity became secondary `Tabs`, the kind's one-line description renders inline beneath the kind tabs, the threshold/window/baseline tooltips were removed, and the threshold/window forms were un-boxed to read as plain fields. Retained: the **`expected`-baseline explanation callout** (shown only in expected mode) and the **one-line live preview** under each card (`formatHumanReadableAlert(alert)`), so the user still sees the sentence form of what they're configuring.
- [x] **Dashboard 3-dots menu — enable Rename + Delete** for user monitors (the M4 placeholders; stay disabled/hidden for system monitors): Rename opens a modal editing name + description (`updateMonitorUseCase`); Delete opens a confirmation (`deleteMonitorUseCase`). Mute/unmute already shipped in M4.
- [x] **In-panel alert editing**: the M4 read-only Alerts section becomes editable via the shared alert-form — the `issue.escalating` card's sensitivity control (system + user) and the saved-search threshold/window forms, saving through `updateMonitorAlertUseCase`; add/remove via `createMonitorAlert` / `deleteMonitorAlert`. `null`-condition cards stay read-only.
- [x] Server functions: `createMonitor`, `createMonitorAlert`, `deleteMonitorAlert`, `updateMonitor`, `deleteMonitor`, `updateMonitorAlert` (mute/unmute shipped in M4).
- [x] Backend tests: creation invariants, alert update invariants, kind/source.type mismatch rejection, kind-not-in-allowlist rejection, saved-search source.id required.

### Milestone UX — Polish the full Monitors frontend

> Branch: `LAT-630/ux-polish` · Runs after M5, before M6. Mostly frontend — the one backend touch is extending the monitors list read for last-incident sorting (below).

**Goal:** A dedicated pass to bring the entire Monitors frontend (everything built across M1–M5: dashboard, details panel, create modal, alert card + threshold/window forms) to a finished, shippable feel. From M6 onward the work is almost entirely backend (issue-event firing, the saved-search pipeline, API/SDK), so this is the natural moment to fully polish the UI while it's fresh and before backend wiring lands on top of it.

Scope is intentionally left open — the exact polish items are decided when the milestone starts, not prescribed here. Two items are pre-committed:

- **Dashboard column sorting.** **Name / Status / Last incident** are sortable (sort persisted in the `monitorsSort` query param), default **last incident descending** with `createdAt`/`id` as deterministic tiebreaks and no-incident monitors last. System monitors flow with the rest (**not pinned**). Backed by the one backend touch: `MonitorRepository.list` + `listMonitorsUseCase` surface each monitor's latest-incident timestamp (`lastIncidentByMonitorId`) to both order the list and populate the `lastIncident` column.
- **`monitors` seeder** (worth front-loading, since it enables the rest): `packages/platform/db-postgres/src/seeds/monitors/`, registered in `all.ts` next to the existing `alert-incidents` seeder, run by `pnpm seed`. It writes the M2/M3 schema directly — monitors + `monitor_alerts` + a spread of `alert_incidents` covering every visual state (open vs closed, muted vs live, notified vs not, each kind/severity, "all"-source vs named-source) — so the polish can exercise the whole frontend now, without waiting for M6/M7 to produce real incidents.

**Shipped (PR #3381).** Beyond the two pre-committed items: dashboard last-incident column + command-palette actions; detail-panel summary row (new `statsByMonitorId` aggregate) and skeleton loading state; incidents table reworked (Status-first, row-as-link to the source, Duration column, fixed `ended_at DESC NULLS FIRST` keyset order); alert create/edit forms moved to `Tabs` pickers with inline field-level validation and un-boxed threshold/window forms; saved-search picker "Create a new saved search" footer. One backend mutation beyond the planned list read: `updateMonitorAlert` now accepts `kind` for user monitors (system monitors stay locked) — safe mid-incident since incidents snapshot kind/condition at open time. The `/search`-targeting deep-links created here are repointed in M8.

### Milestone 6 — Wire issue-event path to monitors (flag-gated)

> Branch: `LAT-630/issue-firing` · Estimated size: ~2,500 lines

**Goal:** With the `monitors` flag enabled for an org, every issue event creates one incident per matching alert; the existing notifications pipeline routes through the mute gate. Flag off = unchanged behaviour. After this milestone, the Incidents section of a flag-on org's system monitors shows live data.

- [x] `resolveMonitorAlertsForSourceEventUseCase({ projectId, kind, sourceId })` in `@domain/monitors` — derives the source type from the kind and returns the matching active `monitor_alerts` (repo method `listActiveAlertsForSourceEvent`, joining through `monitors` to scope by project, excluding soft-deleted alerts/monitors).
- [x] Modify `apps/workers/src/workers/domain-events/alert-incidents.ts`:
  - Flag on: call resolver; for each matching alert, call `createAlertIncidentFromIssueEventUseCase` once with `monitorAlertId` and `condition` (snapshot) populated.
  - Flag off — or flag on with **no** matching alert (a project provisioned before system monitors): a single legacy incident with `monitorAlertId = null`, preserving pre-monitors behaviour.
- [x] Extend `createAlertIncidentFromIssueEventUseCase` to accept optional `monitorAlertId` and `condition` (snapshot). Both surfaced on the `AlertIncident` entity (`.default(null)` so legacy `.parse` callers keep working) + persisted by the repo mapper.
- [x] Mute-gate reader for the owning monitor (incl. soft-deleted alerts). **Not** `MonitorRepository.findByAlertId` — `@domain/monitors` already depends on `@domain/notifications`, so the gate uses a new `IncidentMonitorReader` port **owned by `@domain/notifications`** (`{ monitorId, slug, name, mutedAt }`), implemented in `db-postgres`, avoiding the cycle.
- [x] Extend `incidentBasePayloadShape` in `@domain/notifications` with optional `monitorId` + `monitorName` + `monitorSlug` (name/slug added so the "Created by monitor X" line deep-links without a renderer round-trip) and `condition`. The producer (`request-incident-notifications`) populates them via the reader when the incident has a `monitorAlertId`.
- [x] **Mute gate** in `request-incident-notifications`: when `incident.monitorAlertId IS NOT NULL`, resolve its monitor via the reader; if muted, short-circuit with `skipped: "monitor-muted"` (before the project-level kind gate).
- [x] Email (`incident-event` / `-opened` / `-closed`), in-app, **and Slack** renderers conditionally render a "Created by monitor X" line (+ humanised `formatHumanReadableAlert` condition line) when present; legacy incidents fall back to today's copy. Email + Slack deep-link the monitor name; in-app renders it as text (the card already links to the source). Slack went slightly beyond the spec's "email + in-app" wording for channel parity (shared `monitorAttributionBlocks` helper).
- [x] **Escalation sensitivity sourcing**: on the flag-on path the **worker** resolves the project's system "Issue escalating" monitor alert (via the resolver) and passes its `condition.sensitivity` into `checkIssueEscalationUseCase` as an override (`@domain/issues` can't import `@domain/monitors` — same cycle). Flag-off leaves it unset → the use-case reads `projects.settings.escalation.sensitivity`. `request-incident-notifications` reads the sensitivity off the incident's own condition snapshot for the email chart. Annotated `escalationSettingSchema`, the web read site, and the `/settings/issues` control with the TODO-remove-after-monitors note.
- [x] **`issue.escalating` `startedAt` backtracking** (applies to all orgs, flag-independent): in `checkIssueEscalationUseCase`, on the `enter` transition, walk `histogramByIssues` + `escalationThresholdHistogramByIssues` (same `kShort`) over a 24h/1h-bucket window to find the first bucket where `count ≥ threshold` and forward that timestamp as `escalatedAt`; the worker passes it through as `occurredAt` so the incident's `startedAt` is backtracked. No crossing → event time. Backend tests cover both.
- [x] Hide the three issue-notification checkboxes **and the escalation-sensitivity control** on `/settings/issues` when the `monitors` flag is on (`notificationsEnabled && !monitorsEnabled`). Form fields + read-paths stay; cleanup is the post-rollout PR.
- [x] TODO comments at the legacy sites (`escalationSettingSchema`, the web kShort read, the `/settings/issues` control).
- [x] Backend tests: resolver (all-source / named-source / kind / project / soft-delete / fan-out), `IncidentMonitorReader` (incl. soft-deleted + RLS), mute short-circuit + payload attribution + condition snapshot, `createAlertIncident` stamping, backtracking (first-crossing + no-crossing fallback), sensitivity override.

> **As-built note.** The two `@domain/*` cycle constraints (monitors→notifications, monitors→…→issues) shaped two deviations from the literal task list above: the mute gate uses a notifications-owned `IncidentMonitorReader` port (not `MonitorRepository.findByAlertId`), and the flag-on escalation sensitivity is resolved in the worker and passed into `checkIssueEscalationUseCase` (not read inside `@domain/issues`). The payload also carries `monitorName`/`monitorSlug` (not just `monitorId`) so templates render the deep-linked attribution with no extra round-trip. The worker fan-out falls back to a single legacy incident when the flag is on but no monitor matched, so issue-event behaviour never regresses.

### Milestone 7 — Saved-search firing pipeline

> Branch: `LAT-630/saved-search-firing` · Estimated size: ~2,800 lines

**Goal:** With the flag on, a monitor with a `savedSearch.*` alert fires incidents that land in the details panel and route through the notifications pipeline (subject to mute). Three distinct state machines (threshold one-time, escalating sustained, match) on top of one shared pure evaluator. No new columns on `alert_incidents` — the schema additions in M2 cover everything.

- [ ] New worker file `apps/workers/src/workers/monitors.ts`:
  - `checkSavedSearchMonitorsTask` — orchestrator handler, called by both trigger paths.
  - Sweep cron registration: 5-minute interval, scans active alerts + open sustained incidents.
- [ ] Trace-end hook: publish `monitors:checkSavedSearchMonitors` with the queue's `throttleMs: 5 * 60 * 1000` option (per-org throttle key).
- [ ] `evaluateSavedSearchAlert` in `@domain/monitors` — pure evaluator returning `{ isMet, count, threshold, firstMatchInWindow, baselineCount? }`. Drives all state machines across all three threshold modes (absolute, multiplier, expected). Reuses the trace repo's count + match primitives.
- [ ] **`expected`-mode threshold**: wire the seasonal detector (`evaluateSeasonalEscalation` from `@domain/issues`) for saved searches — feed it the saved-search match counts (per day-of-week × hour-of-day grid) instead of issue occurrences, tuned by `condition.threshold.sensitivity`. Finalise here how the user-facing "N times more than expected" amount maps onto the detector's σ-multiplier. Works for both threshold (5-min current window) and escalating (sustained `window`). Snapshot the seasonal signals onto `entrySignals` exactly as `issue.escalating` does.
- [ ] Three state-machine use-cases:
  - `runSavedSearchThresholdAlert` — handles all modes:
    - Absolute: one-time. Short-circuits on any prior incident for the monitor alert. Read-then-insert wrapped in a transaction with `SELECT … FOR UPDATE` on the `monitor_alerts` row.
    - Multiplier / expected: rearming. Reuses `alert_incidents` rows as state — opens with `endedAt = null` on the rising edge (emits `IncidentCreated`); silently closes (`endedAt = now`, no event emit) when the condition stops holding. Single point-in-time notification per rising edge.
  - `runSavedSearchEscalatingAlert` — sustained, mirrors `issue.escalating`'s open/exit-eligible/reset/close transitions. Snapshots `entrySignals` at the open transition (`{ evaluatedThreshold, baselineCount?, baseline? }` for multiplier; the frozen seasonal signals for expected — baseline frozen at entry either way).
  - `runSavedSearchMatchAlert` — literal throttle. If `evaluateSavedSearchAlert` reports `count > 0`, insert one point-in-time incident with `startedAt = endedAt = firstMatchInWindow`. No prior-incident check, no new state on `monitor_alerts`. The queue's `throttleMs` is the rate-limiter.
- [ ] All three writers stamp `monitor_alert_id`, `condition` snapshot, and `severity` on the new `alert_incidents` row; `startedAt` is backtracked to the first matching trace in the look-back window.
- [ ] `monitors:onSourceDeleted` task — wired from saved-search delete and issue delete events; **soft-deletes** matching `monitor_alerts` (`deleted_at = now()`); soft-deletes the monitor if its active alert list becomes empty.
- [ ] No abstraction over issue.escalating and saved-search kinds at the use-case level — parallel implementations sharing only the storage shape and trigger plumbing. The one deliberate share is the detector: `evaluateSeasonalEscalation` stays owned by `@domain/issues` and is imported by `@domain/monitors`'s `evaluateSavedSearchAlert` for the `expected` mode (fed saved-search counts instead of issue occurrences).
- [ ] Backend tests: each state machine and each threshold mode (absolute, multiplier, **expected**) independently; backtracked `startedAt`; multiplier/expected baseline frozen at entry; `isMet` flapping during dwell resets `exitEligibleSince`; threshold short-circuit after prior fire; sweep cron closes incidents in low-traffic orgs.

### Milestone 8 — Fold `/search` into the `/` page tabs, retire the standalone route

> Branch: `LAT-630/search-bar-relocation` · Estimated size: ~2,200 lines (frontend-heavy)

**Goal:** The `/` page (which already has Sessions and Traces tabs as of #3320) gains the search bar and the saved-searches dropdown directly in its toolbar. The standalone `/search` route is gone. Saved searches no longer carry `assignedUserId` / `createdByUserId`.

Smaller than originally estimated because most of the heavy lifting has already shipped: the session-rollup search was promoted, `/session-search` was retired, and the `save-search-modal` / `saved-searches-list` / `search-syntax-legend` components already live in the shared `-components/` directory. M8 finishes the job by folding `/search/index.tsx`'s logic into `/index.tsx` and dropping the route.

- [ ] Drop `assignedUserId` and `createdByUserId` columns via Drizzle migration. Update `saved_searches.ts` schema, `SavedSearch` entity, repository, every use-case, and the OpenAPI `SavedSearchSchema`.
- [ ] Delete `assignSavedSearchUseCase` and the `POST /searches/{slug}/assign` endpoint. Remove the assign-user UI from `saved-searches-list.tsx`.
- [ ] Add `<SearchInput>` (with the syntax-legend popover) to `Layout.Actions` of `apps/web/src/routes/_authenticated/projects/$projectSlug/index.tsx`. It applies to whichever tab is active. Both `TracesView` and `SessionsView` already accept a `searchQuery` prop.
- [ ] Add `<SavedSearchSelector>` (a new component, dropdown listing project's saved searches with a filter input + "Save current search…" footer) immediately left of `<SearchInput>`. Add `<SaveOrUpdateSearchButton>` immediately right of `<SearchInput>` with the four-state behaviour described above.
- [ ] "Create monitor" / "Edit monitor" entry-point inside each `<SavedSearchSelector>` row.
- [ ] Delete `apps/web/src/routes/_authenticated/projects/$projectSlug/search/index.tsx`. Redirect stale links to `/` (defaulting to the `sessions` tab to match #3320's promotion). The shared `-components/` files (`save-search-modal`, `saved-searches-list`, `search-syntax-legend`) stay where they are — they're already imported from the parent directory.
- [ ] Repoint the monitors deep-links that currently target the standalone `/search` route to the new `/` (traces tab) location with the saved search applied: the incidents-table **Source** cell (`monitor-incidents-table.tsx`, `savedSearch.*` sources → `?savedSearch=<slug>`) and the alert form's "Create a new saved search" dropdown footer (`saved-search-source-picker.tsx`, navigates via `useNavigate`). Both were written against `/search` during Milestone UX.
- [ ] Backend tests: saved-search create/update without the dropped columns; OpenAPI snapshot updated.

### Milestone 9 — API endpoints + SDK + MCP regeneration

> Branch: `LAT-630/api-endpoints` · Estimated size: ~2,000 lines (excluding auto-generated files)

**Goal:** All thirteen monitor endpoints live. SDK regenerated and bumped.

- [ ] `apps/api/src/routes/monitors.ts` — thirteen endpoints on the `defineApiEndpoint<OrganizationScopedEnv>` factory (incl. `createMonitorAlert` / `updateMonitorAlert` / `deleteMonitorAlert`).
- [ ] `apps/api/src/openapi/entities/monitor.ts` — `MonitorSchema` + `toMonitorResponse(monitor)` mapper. Rich `.describe(...)` on every field so SDK and MCP tools carry useful docs.
- [ ] Register routes in `apps/api/src/routes/index.ts` at `/v1/projects/:projectSlug/monitors`.
- [ ] Reuse domain Zod schemas for input validation.
- [ ] `pnpm openapi:emit && pnpm mcp:emit && pnpm --filter @latitude-data/sdk generate`. Commit the generated files in the same PR.
- [ ] Bump SDK version in `packages/sdk/package.json` and add a CHANGELOG entry under `packages/sdk/CHANGELOG.md`.
- [ ] Backend tests for the thirteen endpoints: schema validation, auth/scope, response shape, error cases (delete on system monitor, kind not in allowlist, mismatched kind/source.type, `updateMonitorAlert` rejecting kind/source change on system but allowing a kind change on a user monitor, create/delete alert on system rejected, system `updateMonitor`/`deleteMonitor` rejection, system `updateMonitorAlert` condition edit allowed).

### Milestone 10 — User-facing documentation

> Branch: `LAT-630/user-docs` · Estimated size: ~600 lines (markdown + screenshots)

**Goal:** A customer reading our public Mintlify docs can understand monitors end-to-end without reading any source code, and can configure one from scratch.

- [ ] New page `docs/monitors.mdx` (Mintlify format, mirroring the existing pages under `docs/`). Sections:
  - **What monitors are**: the concept, the system-vs-user distinction, what they monitor today (issues + saved searches), how they relate to incidents and notifications.
  - **The three system monitors**: one paragraph each on Issue discovered / Issue regressed / Issue escalating, including how to mute one (and noting they're not deletable).
  - **Creating a monitor for a saved search**: step-by-step. Where to enter the flow (saved-searches dropdown on the traces page OR the "+ New monitor" button on the Monitors page), the alert-form fields, how the human-readable preview at the bottom of the card reflects the configuration.
  - **The three saved-search alert kinds**, with worked examples and screenshots:
    - **match** — "alert me when matching traces start arriving". Explain the 5-minute throttle: a burst of 500 simultaneous matches produces one alert; continuous matching activity surfaces one alert every 5 minutes (so the customer doesn't tune it out and forget); a quiet period followed by new matches produces a fresh alert. Make the "every 5 minutes if activity is continuous" behaviour explicit so it's not a surprise.
    - **threshold (absolute)** — milestone alarms ("alert me when 100 5xx traces have matched").
    - **threshold (multiplier)** — spike detection ("alert me when I'm seeing 3× my baseline rate"). Explain the baseline choices: **the average of the last …** (the typical/normal-traffic case) vs **yesterday / the previous week** (for daily/weekly seasonality). Worked example with concrete numbers showing the normalisation, so customers don't have to derive it.
    - **expected** — the smart, dynamically-learned baseline ("alert me when I'm seeing more traffic than expected for this time of day/week"). Explain that, unlike average/previous-period, the customer picks no comparison window — Latitude learns the normal shape of traffic per time-of-day × day-of-week (same engine as automatic issue-escalation) — and that the single knob is **sensitivity**. Call out when to prefer it (traffic with strong, irregular seasonality) over a fixed average.
    - **escalating (absolute, multiplier, and expected)** — sustained-condition alerts, with explanation of how the `window` field doubles as count window + exit dwell, and why that filters out short noise spikes. Any of the threshold modes can be combined with a sustained window.
  - **Mute, delete, edit**: what each action does, mute semantics (incidents still recorded, no notifications), what's editable on system vs user monitors.
  - **How notifications work**: brief, links to existing notification docs page. Clarify that monitors don't have their own notification settings — channel-level routing lives in the existing user/project preferences.
- [ ] Add the page to the Mintlify nav (`docs/mint.json` or equivalent config), under the appropriate section (likely "Alerts" or "Reliability").
- [ ] Add cross-links from existing related pages (issues, saved searches, notifications) to the new monitors page.
- [ ] If feasible: 2-3 inline screenshots of the dashboard and the create modal. Optional if the screenshots block on the UI not being final-final.

### Milestone 11 — Remove stale feature flags

> Branch: `LAT-630/remove-stale-flags` · Estimated size: ~400 lines

**Goal:** Three flags that are on for everyone get removed. The `monitors` flag stays.

- [ ] Remove `email-notifications`, `notifications`, `timeline-incidents` from the registry. Drop every read site (worker, frontend hooks, settings pages).
- [ ] One-shot SQL cleanup: `DELETE FROM organization_feature_flags WHERE identifier IN ('email-notifications', 'notifications', 'timeline-incidents');` (manual command, runbook entry, not a Drizzle migration).
- [ ] `grep -r` sanity check: no remaining references.

### Milestone 12 — Promote spec to dev-docs

> Branch: `LAT-630/dev-docs` · Estimated size: minimal

**Goal:** Durable design knowledge lives at `dev-docs/monitors.md`; `specs/monitors.md` is removed.

- [ ] Copy the non-implementation-plan sections of `specs/monitors.md` to `dev-docs/monitors.md`, reframed as durable docs.
- [ ] Add cross-links from `dev-docs/notifications.md` and `dev-docs/reliability.md`.
- [ ] Delete `specs/monitors.md`.
- [ ] No code changes.

---

