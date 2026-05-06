# Alerts

> **Documentation**: `dev-docs/reliability.md`, `dev-docs/issues.md`, `dev-docs/spans.md`

## Purpose

This document captures the product and architecture discussion around Alerts.

It describes the long-term shape of the Alerts product, the MVP carved out of that vision, how the system relates to existing Latitude features, how user-facing configuration works, and which design questions remain open.

The MVP-specific sections (**MVP Scope**, **MVP Data Model**, **MVP Architecture and Flow**, **Notification System**, **Implementation Plan**) are the source of truth for what is being built first. The broader sections describe the eventual product.

## Problem

Notification delivery is not a new infrastructure problem; Latitude already sends transactional email. The alerts system owns a different question:

> When and why should Latitude create a notification-worthy signal?

The core product problem is to let users express "tell me when something meaningful happens" without forcing them to learn a generic monitoring query language.

## Current Product Context

Trace ingestion is already implemented end-to-end:

- `apps/ingest` accepts trace payloads.
- span ingestion workers decode OTLP payloads and persist spans into ClickHouse.
- `SpanIngested` fans out to trace-end processing.

Issue discovery and tracking are also already wired:

- scores are the canonical issue-discovery signal.
- eligible failed scores create or match issues through the issue-discovery pipeline.
- evaluation failures for issue-linked evaluations are written with `issueId`, which lets them track existing issues directly.
- issues already have lifecycle concepts such as `new`, `escalating`, `resolved`, `regressed`, and `ignored`.
- issue states are **derived at read time** in `packages/domain/issues/src/helpers.ts` (`deriveIssueLifecycleStates`); only `resolvedAt` and `ignoredAt` are stored. `escalatedAt` exists on the schema but is not currently written.

Saved Searches are implemented as stored trace search scopes:

- a saved search stores `query` plus `filterSet`.
- the search page can list, open, update, rename, assign, and delete saved searches.
- the trace repository already exposes count, last-match, annotated count, metric aggregate, histogram, and single-trace filter matching primitives that can support alert evaluation.

Alerts should build on these existing concepts instead of inventing a separate monitoring query model from scratch.

## MVP Scope

V1 ships project-scoped, event-driven alerts only. Two alert kinds — `issue.new` and `issue.regressed` — are persisted as `alert_incidents` rows in PR 1, with email and in-app channels added in PR 2 and PR 3 respectively. Every other alert category in this document is deferred.

**In scope for V1:**

- Two alert kinds: New Issue Discovered, Issue Regressed
- `alert_incidents` table as the system-of-record for fired alerts (PR 1)
- Email delivery to organization members (PR 2)
- Distinct email templates per alert kind (PR 2)
- In-app notification feed with read state (PR 3)
- Per-project channel toggles (PR 2): which kinds get emailed
- Per-user channel toggles (PR 2): opt out of email entirely
- Org-level `alerts` feature flag introduced in PR 2 for staged rollout

**Deferred:**

- `issue.escalating` alert kind — escalation is a derived state computed from occurrence analytics; reifying it at write time requires loading the aggregate on every score assignment. Defer until a periodic recomputation worker exists or the cost is justified.
- Issue-scoped alerts (per-issue subscriptions, volume spike, stops receiving matches)
- Saved Search alerts of any kind
- Threshold and anomaly detection
- Trace-match and scheduled-check trigger engines
- Slack and other custom channels
- Incident lifecycle (acknowledge, resolve, sustained-condition tracking)
- Email delivery audit log
- Per-(user, organization) membership settings — V1 user settings are global per user
- Per-project subscriber model — V1 notifies all org members
- Digest or batching strategies
- Org-level default preferences

**Why this cut:**

- Issue lifecycle changes for `new` and `regressed` are cheap to reify at write time. Both are already on the score-assignment / issue-creation paths and require no new infrastructure for detection.
- `issue.escalating` requires the issue's occurrence aggregate at write time, which is expensive on the hot score-assignment path. Deferring keeps PR 1 lean.
- Splitting incident creation (PR 1) from each delivery channel (PR 2 email, PR 3 in-app) bounds the blast radius of each PR. Channels can ship and roll back independently of the data layer.

## Conceptual Model

The conceptual model below describes the eventual product. The MVP exercises a subset of these concepts.

### Alert Rule

An alert rule is user configuration. It answers:

- what scope is being watched
- what condition is being evaluated
- how severe a firing should be
- whether the rule is enabled
- how repeated firings are deduped or cooled down

Conceptual shape:

```typescript
type AlertSeverity = "critical" | "high" | "medium" | "low"

type AlertRuleConcept = {
  id: string
  projectId: string
  name: string
  enabled: boolean
  severity: AlertSeverity
  scope: AlertScope
  trigger: AlertTrigger
  cooldownMinutes?: number
}
```

Severity belongs on each alert rule, not only on the parent scope. This supports multiple rules for the same saved search or issue with different priority:

```text
(High)     total monthly cost > $20
(Critical) total monthly cost > $40
```

Severity should later drive notification routing and escalation policy. It should not initially imply a different detector algorithm unless there is a strong product reason.

**V1 does not introduce an `AlertRule` entity.** The two project alert kinds are unconditional in PR 1 (every emission produces an incident). PR 2 introduces channel-level gating via per-project and per-user settings stored as jsonb on `projects` and `users`. Severity is hardcoded per kind. A rules table only earns its keep when alerts grow beyond one-per-kind-per-project — saved-search alerts will be that second instance.

### Alert Event

An alert event is a single firing of a rule. It answers:

- which rule fired
- when it fired
- what observed value caused it
- what threshold or dynamic bound was crossed
- what trace, issue, saved search, or window the event refers to

Alert events should exist before notification delivery exists so the system is auditable and testable.

**In V1, alert events are realized as `alert_incidents` rows introduced in PR 1.** PR 1 ships only the data layer; PR 2 and PR 3 add the email and in-app channels as consumers of `IncidentCreated`.

### Incident

An incident is a longer-lived active state caused by one or more alert events. Incidents are useful for threshold and anomaly rules because the condition can remain active across many evaluations.

**V1 incidents have no lifecycle.** The `alert_incidents` table is introduced in PR 1, but the rows are simple dispatch records: one row per firing, no `status`, `acknowledged_at`, or `resolved_at`. Lifecycle columns can be added later without migration risk.

The conceptual separation that should outlive V1:

- **Alert Rule**: user configuration
- **Alert Event**: a single firing caused by a rule
- **Incident**: optional future active state that groups one or more firings

In V1, Rule is replaced by per-channel settings, Event is the same row as Incident, and lifecycle is absent. The full separation appears as more alert categories are added.

## Alert Scopes

Alerts should be scoped to one of three product surfaces.

### Project Scope

Project alerts are project-wide and mostly watch issue lifecycle or discovery events.

Typical use cases:

- notify when a new issue is discovered in the project
- notify when any issue regresses
- notify when any issue becomes escalating

**V1 implements only project scope.**

### Issue Scope

Issue alerts are configured for one specific issue.

Typical use cases:

- notify when a new trace/score matches this issue
- notify when this issue's match volume spikes
- optionally notify when this issue stops receiving matches

**Deferred.**

### Saved Search Scope

Saved Search alerts are configured for one saved trace search. The saved search query and `filterSet` define the monitored population of traces.

Typical use cases:

- notify when a new trace matches the saved search
- notify when matching trace volume spikes
- notify when the saved search stops matching traces
- notify when matching trace metrics cross static thresholds
- notify when matching trace metrics become anomalously high

Alert rules should reference the saved search by id, not copy its filters by default. Editing the saved search should update what its alerts monitor. A later product decision can add "snapshot filters" if users need rules that do not follow saved-search edits.

**Deferred.**

## Trigger Engines

Alert scopes describe what is watched. Trigger engines describe how evaluation runs.

### Event Alerts

Event alerts fire from domain events or lifecycle transitions.

Examples:

- project: new issue discovered
- project: issue regressed
- project: issue became escalating
- issue: issue resolved or ignored, if needed later

Event alerts are evaluated by a dedicated alerts worker that consumes domain events. The event carries ids only; the alert evaluator re-fetches current state before firing user-visible alert events.

**V1 implements only the event trigger engine.**

### Trace Match Alerts

Trace match alerts run when a trace finishes or when a score is assigned to an issue.

Examples:

- saved search: a new trace matches this saved search
- saved search: any matching trace has cost over `$0.20`
- issue: a new trace/score matched this issue

For saved searches, trace matching can reuse the existing filter matching concept: evaluate the new trace against saved-search filter sets and optional per-trace metric predicates.

For issue alerts, a new match is driven by score assignment to the issue, not by the raw trace alone. The alert should fire when the issue gains a new owned score/occurrence.

**Deferred.**

### Scheduled Checks

Scheduled checks periodically evaluate aggregate conditions over windows.

Examples:

- saved search: total cost this month is over `$20`
- saved search: average duration over the last hour is over `5s`
- saved search: matching trace volume is anomalously high
- issue: match volume is anomalously high

Scheduled checks conceptually evaluate persisted alert rules, compute current values from trace/score analytics, apply dedupe/cooldown rules, and create alert events when rules fire.

**Deferred.**

## Project Alerts

Project alerts are configured once per project.

### New Issue Discovered

**V1.** Configured per project in PR 2 (`alerts.notifyOnNewIssue`).

User-facing configuration:

```text
[x] Notify when a new issue is discovered
```

Internal shape:

- scope: project
- trigger: event — `IssueCreated`
- emission point: `createIssueFromScoreUseCase` in `packages/domain/issues`, after `issueRepository.save(issue)`
- severity: hardcoded `medium`
- dedupe: `issue.new:${issueId}` (an issue can only be new once)

### Issue Regressed

**V1.** Configured per project in PR 2 (`alerts.notifyOnRegression`).

User-facing configuration:

```text
[x] Notify when an issue regresses
```

Internal shape:

- scope: project
- trigger: event — `IssueRegressed`
- emission point: `assign-score-to-issue.ts` in `packages/domain/issues`. When `issue.resolvedAt != null && score.lastSeenAt > issue.resolvedAt`, clear `resolvedAt` on the issue (reifying the transition) and emit `IssueRegressed` after save.
- severity: hardcoded `high`
- dedupe: `issue.regressed:${issueId}:${triggerScoreId}` — the regressing score id discriminates per-cycle so a future regression after resolution is a distinct incident

The clearing of `resolvedAt` is the source of idempotency: a second score arriving in the same regression window will not see `resolvedAt != null` and will not re-emit.

### Issue Became Escalating

**Deferred from V1.** Future direction documented for design continuity.

User-facing configuration:

```text
[x] Notify when an issue starts escalating
```

Internal shape:

- scope: project
- trigger: event — `IssueEscalated` (not yet emitted)
- detection: requires the issue's occurrence aggregate (`recentOccurrences` vs `baselineAvgOccurrences`) which lives in analytics. Detecting the transition either requires loading the aggregate on every score assignment (expensive on the hot path) or a periodic recomputation worker that compares previous-derived-state to current and emits transition events.
- severity: hardcoded `high`
- dedupe: would need a per-cycle discriminator analogous to the regression `triggerScoreId`

The existing issue state definition says an issue is escalating when recent occurrences exceed its baseline by a configured factor and minimum count. Alerting will reuse the lifecycle state rather than implement a second independent escalation definition.

V1 does not attempt to track "still escalating" reminders. A transition is a one-shot signal.

## Issue Alerts

**Deferred from V1.** Future direction documented for design continuity.

### New Match

User-facing configuration:

```text
[x] (High v) Notify when a new trace matches this issue
```

Internal shape:

- scope: issue
- trigger: trace match
- source signal: score assignment to the issue
- configurable fields: enabled, severity, optional cooldown
- dedupe: rule id plus score id or trace id

### Volume Spike

User-facing configuration:

```text
[x] (High v) Notify when match volume spikes
```

Internal shape:

- scope: issue
- trigger: scheduled anomaly
- metric: issue occurrence count
- aggregation: count per fixed evaluation window
- configurable fields: enabled, severity
- non-configurable defaults: evaluation cadence, baseline window, minimum occurrence count, cooldown

The user should not configure multipliers, percentiles, baseline windows, or sensitivity in the first UI. Latitude should compute dynamic bounds from historical occurrence counts.

This overlaps significantly with the existing escalation lifecycle and may be cut entirely in favor of escalation alerts.

### Stops Receiving Matches

This is optional and likely not in early scope unless a concrete user need appears.

User-facing configuration:

```text
[ ] (Low v) Notify when this issue stops receiving matches
```

Internal shape:

- scope: issue
- trigger: scheduled check
- condition: no occurrences in current window after a historically active baseline
- configurable fields: enabled, severity

This overlaps with automatic resolution and may not need a separate alert.

## Saved Search Alerts

**Deferred from V1.** Future direction documented for design continuity. This is the first detailed UI target after V1.

A saved search defines the trace population. Alert UI should not expose a generic query builder. It should expose simple alert rows that compile to alert rules internally.

### Suggested UI Shape

The alerts control should live inside a Saved Search, likely behind an "Alerts" button. It can open a popover or modal containing a list of alert rows.

```text
Alerts for "Failed payments"

Default alerts
[ ] (Medium v) Notify when a new trace matches
[x] (High v) Notify when matching trace volume spikes
[ ] (Medium v) Notify when this search stops matching traces

Anomalies
[x] (High v) Notify when [cost v] anomalies happen
[ ] (Medium v) Notify when [duration v] anomalies happen
+ Add anomaly

Metric alerts
[x] (High v) Notify when [total v] [cost v] is [over v] [$20] during [this month v]
[x] (Critical v) Notify when [any v] [cost v] is [over v] [$0.20]
+ Add metric alert
```

There should be no separate advanced panel. Anything that is not in this UI is not user-configurable.

### New Trace Match

User-facing configuration:

```text
[ ] (Medium v) Notify when a new trace matches
```

Internal shape:

- scope: saved search
- trigger: trace match
- conditions: none
- configurable fields: enabled, severity, cooldown
- dedupe: rule id plus trace id

### Stops Matching Traces

User-facing configuration:

```text
[ ] (Medium v) Notify when this search stops matching traces
```

Internal shape:

- scope: saved search
- trigger: scheduled check
- condition: current window has zero matching traces after the saved search was historically active
- configurable fields: enabled, severity
- non-configurable defaults: activity baseline, evaluation cadence, cooldown

This must be carefully defined to avoid noisy alerts for searches that naturally match rarely.

### Volume Spike

User-facing configuration:

```text
[x] (High v) Notify when matching trace volume spikes
```

Internal shape:

- scope: saved search
- trigger: scheduled anomaly
- metric: matching trace count
- aggregation: count per evaluation window
- configurable fields: enabled, severity
- non-configurable defaults: evaluation cadence, baseline window, minimum count, cooldown

### Metric Threshold Alerts

Metric threshold alerts are user-configured static conditions.

User-facing row format:

```text
[x] (High v) Notify when [aggregation v] [metric v] is [operator v] [value] during [window v]
```

If aggregation is `any`, the row describes a per-trace condition and does not need a window:

```text
[x] (Critical v) Notify when [any v] [cost v] is [over v] [$0.20]
```

Supported aggregations:

- `any`: any matching trace crosses the threshold; evaluated as a trace-match alert
- `count`: count of matching traces in a window
- `total`: sum of the metric in a window
- `average`: average value in a window
- `max`: maximum value in a window
- `p95`: p95 value in a window

Supported metrics:

- trace count
- cost
- duration
- TTFT
- token usage

Supported operators:

- `over` for first iteration

Supported windows:

- last 15 minutes
- last hour
- last day
- last 7 days
- this month

Internal mapping:

- `any` aggregation maps to the trace-match trigger engine.
- all windowed aggregations map to the scheduled-check trigger engine.

### Anomaly Alerts

Anomaly alerts are scheduled, dynamic checks. They are not per-trace outlier detection. Single-trace threshold behavior belongs to metric threshold alerts using `any`.

User-facing configuration:

```text
[x] (High v) Notify when [cost v] anomalies happen
[ ] (Medium v) Notify when [duration v] anomalies happen
+ Add anomaly
```

Supported anomaly metrics:

- volume
- cost
- duration
- TTFT
- token usage

All anomaly metrics are "higher is worse". Lower-bound anomalies are not part of the first design except for the separate "stops matching traces" alert.

The user should not configure:

- p50/p95/p99
- MAD multiplier
- baseline window
- current window
- sensitivity
- seasonal strategy
- comparison threshold

Severity remains configurable, but severity is for priority/routing, not detector tuning.

## Anomaly Definition

**Deferred from V1.**

For Saved Searches and Issue volume spikes, an anomaly means:

> The current aggregate value is unusually high compared with the historical behavior of this same scope, and there is enough historical data to trust that comparison.

There is no universal anomaly detector that works for all metrics and all data shapes. The preferred initial product direction is a robust statistical detector rather than a machine-learning black box.

### Proposed Initial Definition

Use a percentile/MAD-style dynamic upper band.

For each anomaly rule:

1. evaluate on a fixed cadence, probably hourly
2. compute the current window value
3. compute historical comparable window values for the same scope and metric
4. compute the historical median
5. compute `MAD = median(abs(value - median))`
6. compute `scaledMAD = MAD * 1.4826`
7. compute `upperBound = median + k * scaledMAD`
8. fire if current value is above `upperBound`, minimum sample/volume requirements are met, and cooldown is not active

This works better than a fixed multiplier because stable searches get narrow bounds while noisy searches get wider bounds.

Example:

- a saved search whose p95 duration is normally between `4s` and `4.5s` should alert when recent p95 duration becomes `8s`
- a saved search whose p95 duration naturally ranges from `20s` to `5m` should not alert for ordinary values inside that broad range

The exact `k`, current window, baseline window, minimum historical buckets, minimum current value, consecutive breach requirement, and cooldown are product/architecture constants to settle before this becomes a build plan. They are not UI settings.

Potential conservative defaults:

- evaluation cadence: hourly
- current window: last hour
- baseline: previous 14 days of hourly buckets
- minimum historical buckets: 48
- minimum current count for volume anomaly: 10 matching traces
- consecutive breaches: 1 or 2, still undecided
- cooldown: 24h per alert rule

When there is not enough history, the rule should not fire. The UI can show "Learning normal behavior" or similar status if needed.

## MVP Data Model

V1 introduces no `alert_rules` table. PR 1 ships the `alert_incidents` table as the system-of-record. PR 2 adds per-project and per-user channel settings as jsonb on existing `projects` and `users` rows. PR 3 adds the in-app `notifications` table.

### Alert incident (PR 1)

```typescript
type AlertIncident = {
  id: string
  organization_id: string
  project_id: string
  source_type: 'issue'                    // polymorphic for future sources
  source_id: string                        // issue id
  kind: 'issue.new' | 'issue.regressed'    // namespaced; future: issue.escalating, saved_search.*
  severity: 'medium' | 'high'              // hardcoded per kind in V1, stored for forward compatibility
  started_at: Date                         // when the underlying transition occurred
  ended_at: Date | null                    // nullable; always NULL in V1 (all V1 kinds are one-off)
  dedupe_key: string                       // unique idempotency token, see below
}
```

Stored as `alert_incidents`.

**Naming**: `alert_incidents` is preferred over `incidents` to avoid the PagerDuty-style "incident with ack/resolve lifecycle" connotation, and over `alerts` to avoid overloading with rule/configuration language. The `alert_` prefix matches repo style (e.g., `feature_flags`, `organization_feature_flags`).

**Polymorphic source pointer**: `(source_type, source_id)` is the standard cross-system pattern (GitHub, Sentry, Linear). It loses DB-level FK integrity on `source_id`, which is acceptable for an audit-style table where applications validate the reference. The alternative — one nullable FK per source type with a CHECK constraint — gets ugly fast as source types grow.

**Kind**: a namespaced string. PR 1 supports `issue.new` and `issue.regressed`. The namespace prefix prevents collisions across source types (`issue.new` ≠ `saved_search.new`) and keeps the column self-documenting. Layered on top with a Zod enum in domain code for type safety.

**started_at and ended_at**: `started_at` is the timestamp from the underlying domain transition (carried on the event), not the wall-clock at insert time. `ended_at` is nullable and **always NULL in V1** because both V1 kinds are one-off events with no notion of resolution. The column is included now to accommodate sustained conditions (thresholds, anomalies) without a future migration; the precise semantics for "still active" vs "one-off" will be decided when the first sustained kind ships.

**Severity placement**: stored at write time, not derived. The mapping is hardcoded today, but storing the value forward-compatibly lets configurable severity land without a migration.

**Dedupe key**: per-kind deterministic token, unique across the table. Avoids a composite unique constraint that would change shape per kind.

- `issue.new`: `issue.new:${issueId}`
- `issue.regressed`: `issue.regressed:${issueId}:${triggerScoreId}`

Recommended indexes:

- unique on `dedupe_key`
- `(organization_id, project_id, started_at desc)` for project-scoped feeds
- `(source_type, source_id, started_at desc)` for "what alerts fired for this issue"

### Project alert settings (PR 2)

```typescript
type ProjectAlertSettings = {
  notifyOnNewIssue: boolean       // default: true
  notifyOnRegression: boolean     // default: true
}
```

Stored under `alerts` in the existing `projects.settings` jsonb column. Validated with a Zod schema on read and write. Reads merge with defaults so existing rows or partial blobs return a fully populated object.

**These settings gate the email channel, not incident creation.** Incidents in `alert_incidents` are written unconditionally for every emission. The toggles control whether the email worker sends mail for an incident of that kind.

PR 2 does not include `notifyOnEscalation` because `issue.escalating` is deferred from V1 entirely.

### User notification settings (PR 2)

```typescript
type UserNotificationSettings = {
  emailEnabled: boolean           // default: true
}
```

Stored as a new `users.settings: jsonb` column (no existing column today). Same Zod-validation and default-merge pattern as project settings. Settings are global per user, not per (user, organization) membership.

### Notification (PR 3)

```typescript
type Notification = {
  id: string
  recipient_user_id: string
  alert_incident_id: string
  created_at: Date
  seen_at: Date | null
}
```

In-app feed entries only. No email log table — emails are fire-and-forget in V1. Content is rendered on read from the linked incident plus its source.

## MVP Architecture and Flow

### Event emission (PR 1)

Two domain events are added to `packages/domain/events`:

- `IssueCreated` — emitted in `createIssueFromScoreUseCase` after `issueRepository.save(issue)`. Payload: `{ organizationId, projectId, issueId, createdAt }`.
- `IssueRegressed` — emitted in `assign-score-to-issue.ts` after the score is assigned, when `issue.resolvedAt != null && score.lastSeenAt > issue.resolvedAt`. The use case clears `resolvedAt` on the saved issue (reifying the regression) and writes the event. Payload: `{ organizationId, projectId, issueId, regressedAt, triggerScoreId }`.

Per-direction policy: V1 emits only the events it consumes. Lifecycle commands (`IssueResolved`, `IssueIgnored`, etc.) are not emitted until a consumer needs them.

### Alerts worker (PR 1)

```text
[issue domain] emits IssueCreated or IssueRegressed
   ↓
[alerts worker subscribes]
   - re-fetch the issue and project to confirm current state
   - compute dedupe_key and severity from kind
   - INSERT alert_incidents row, ON CONFLICT (dedupe_key) DO NOTHING
   - if a row was actually inserted, emit IncidentCreated { incidentId }
```

PR 1 has no feature flag, no settings checks, and no delivery. Incident creation is unconditional for every consumed event. The worker is a pure producer of `alert_incidents` rows and `IncidentCreated` events.

### Email worker (PR 2)

```text
[IncidentCreated]
   ↓
[email worker subscribes]
   - feature flag: alerts enabled for org? if not, drop
   - load project.settings.alerts; if the kind toggle is off, drop
   - load org members
   - for each member, read users.settings.notifications.emailEnabled; if off, skip
   - render per-kind template, enqueue email job
   - email job idempotency key: emails:alert:${incidentId}:${recipientUserId}
```

Email sending uses the existing `@domain/email` + `@platform/email-transport` pipeline (Mailgun prod, Mailpit dev), the same path that already handles login and invite emails.

### Notifications worker (PR 3)

```text
[IncidentCreated]
   ↓
[notifications worker subscribes]
   - load incident, org members
   - for each member, INSERT notifications row, ON CONFLICT (incident_id, recipient_user_id) DO NOTHING
   - in-app fan-out is unconditional in V1; per-user in_app_enabled is a future addition
```

### Idempotency

- `alert_incidents` (PR 1): unique constraint on `dedupe_key`. The worker writes idempotently and only emits `IncidentCreated` when the row was actually inserted (not on conflict).
- Email job (PR 2): BullMQ job id derived from `(incidentId, recipientUserId)`.
- `notifications` (PR 3): unique constraint on `(incident_id, recipient_user_id)`.

### Recipient resolution

V1 broadcasts to all organization members. This is a conscious simplification. Per-project subscribers and per-issue watchers are deferred until customer feedback justifies the extra surface.

### Severity placement

Severity is stored on the incident row at write time, not derived at read time. The mapping is hardcoded today (`issue.new` → `medium`, `issue.regressed` → `high`), but storing the value forward-compatibly lets future configurable severity land without a migration.

## Notification System

V1 supports two channels: email (PR 2, outbound, fire-and-forget) and in-app (PR 3, persisted for read state). Slack and other custom channels are designed-around but not implemented.

### Channel separation

In-app notifications are persisted with read state. They render content on read by joining to the linked incident and its source. They live forever in the user's feed.

Emails are write-once, frozen at send time, and not persisted as a delivery log in V1. The user receives the email; that is the artifact. Bounce handling, retry logic, and provider message ids are handled by the existing email infrastructure; alerts reuse that pipeline rather than introducing new sender plumbing.

### Forward compatibility

The `notifications` table introduced in PR 3 keeps room for future delivery channels:

- additional channels (Slack, push) can land as sibling delivery tables joined by `alert_incident_id` rather than overloading the in-app feed table
- new source types (announcements, saved-search alerts, system messages) are accommodated by the polymorphic `source_type` already on `alert_incidents`
- a renderer registry keyed on `(source_type, kind)` produces the title/body/action for each surface

The `users.settings` jsonb shape allows future channel toggles without a schema change. New keys can be added with sensible defaults.

### Out of scope for V1

- Email log table for audit and bounce reconciliation
- Per-channel preference granularity in user settings
- Per-event-kind preference granularity in user settings
- Slack integration
- Digest or batching strategies
- Org-level default preferences
- Migrating login and invite emails through the alerts pipeline

## Architecture Shape

The broader architecture (beyond V1) recognizes three distinct paths.

### Domain Event Path

Domain event alerts are conceptually downstream of existing domain events and lifecycle transitions. They should not redefine issue lifecycle rules. For example, a regressed issue alert should depend on the Issue system deciding that the issue regressed.

The key architecture idea is that event alerts react to facts that the domain already knows.

**V1 implements only this path.**

### Trace Match Path

Trace match alerts are conceptually tied to trace-end processing and issue score assignment.

For Saved Searches, a trace match alert asks whether a newly completed trace belongs to the saved search population. For Issue alerts, a new match is not raw trace matching; it is score ownership: a score/occurrence has been assigned to that issue.

Per-trace metric threshold alerts also belong to this path when their aggregation is `any`, for example:

```text
Notify when [any] [cost] is [over] [$0.20]
```

### Scheduled Check Path

Scheduled checks are conceptually periodic evaluations over a window. They cover aggregate thresholds and anomaly checks.

These alerts need historical metric data, a current evaluation window, and enough state to avoid repeatedly firing the same condition too often.

The important architecture idea is that scheduled alerts compare populations over time, while trace match alerts evaluate one new trace or occurrence.

## Relationship To Other Features

### Trace Ingestion

Trace ingestion provides the raw telemetry and materialized traces. Saved Search alerts depend on this data because a saved search is a named population of traces.

Trace-end processing is the natural conceptual moment for "new trace match" alerts and `any` per-trace metric alerts.

### Issues

Issues provide semantic failure grouping and lifecycle state. Project and Issue alerts should reuse issue lifecycle semantics instead of duplicating them.

Relevant existing issue states:

- `new`
- `escalating`
- `resolved`
- `regressed`
- `ignored`

Issue states are derived at read time today. V1 reifies the regression transition by clearing `resolvedAt` at the moment of regression so the derive helper continues to work and idempotency is robust. Future `issue.escalating` will likely require a similar reification (writing `escalatedAt`) once a write-time detector exists.

Issue-scoped alerts (deferred) should use score assignment as the match signal because issues are backed by scores, not raw traces alone.

### Evaluations

Evaluations can track specific issues because failed live evaluations are written as scores linked to the evaluation's issue. This means issue alerts can capture evaluation-driven matches as ordinary issue occurrences.

Evaluation notification routing is not part of the current discussion, but issue-linked evaluation failures are one source of alert-worthy matches.

### Saved Searches

Saved Searches are the clearest initial product surface for alert configuration after V1. They already store the trace population as `query` plus `filterSet`.

Saved Search alerts should be configured inside the Saved Search surface. Users should not have to create a new independent query in the alerting UI.

## Alternatives Considered

### Generic Monitor Builder

One option is to expose a generic monitoring/query builder like Datadog or Grafana. This would make the system powerful but probably too complex for the initial Latitude UX.

Rejected: Saved Search alerts should feel like simple alert rows attached to a saved search, not a full query language.

### Metric-Grouped UI

One option is to organize the UI by metric groups:

```text
Duration
Cost
Token usage
```

This may work for browsing, but it becomes bulky once users add multiple alerts. The preferred direction is a row-based sentence UI where each alert reads naturally.

### Single-Trace Anomaly Alerts

One option is to let "anomaly" include single-trace outlier detection.

Rejected: per-trace outliers are covered by static metric alerts using `any`, such as:

```text
Notify when [any] [cost] is [over] [$0.20]
```

Anomaly alerts should be scheduled/window-based only.

### User-Configurable Anomaly Parameters

One option is to expose p50/p95, baseline windows, MAD multipliers, and sensitivity.

Rejected: there is no advanced panel. If a setting is not in the main UI, it is not configurable. Anomaly alerts should let users choose the metric and severity, while Latitude owns the dynamic threshold behavior.

### Alert Rules Table from Day One

One option is to introduce a normalized `alert_rules` table for V1 even though only two project-wide kinds exist.

Rejected: two boolean fields per project do not justify the entity. Per-project channel toggles fit comfortably under the existing `projects.settings` jsonb column. The rules table earns its keep when alerts grow beyond one-per-kind-per-project, which is when saved-search alerts ship.

### Per-(User, Organization) Membership Settings

One option is to scope user notification settings to each membership so a user in multiple organizations can receive different alerts per org.

Rejected for V1: most users today belong to one organization. Global per-user settings are simpler in UI and storage. Migration to per-membership is a one-time chore if customer feedback justifies it later. The decision is reversible, but the cost of getting it wrong now is low.

### Single Table for In-App and Outbound Notifications

One option is to record every channel (in-app, email, future Slack) in one `notifications` table with a `channel` column.

Rejected: in-app and email have fundamentally different lifecycles. In-app is stateful (read state), reactive to source changes, and lives forever in a feed. Email is write-once, frozen at send, and audited via provider message ids. Unifying produces a table where most columns are nullable per channel. V1 keeps in-app in `notifications` and treats email as a fire-and-forget channel through the existing email infrastructure.

### Migrate Login and Invite Emails Through the Alerts Pipeline

One option is to route all user-facing emails (login codes, invites, billing receipts, alerts) through the same alerts/notification pipeline.

Rejected: transactional emails are not preference-gated and have a different deliverability profile (must always send). Mixing them with preference-gated alerts invites confusion. The alerts pipeline is shaped to allow a future migration if it ever makes sense, but V1 does not pursue it.

### Incident Lifecycle in V1

One option is to ship `alert_incidents` with `status`, `acknowledged_at`, and `resolved_at` from the start.

Rejected: V1 alerts are discrete event-driven transitions on issues. The issue lifecycle is the persistent state; an `alert_incidents` row is a record of "this transition happened". Lifecycle columns earn their keep when sustained conditions appear (thresholds, anomalies). They can be added later without migration risk.

### Settings Gating Incident Creation Instead of Channels

One option is for `project.alerts.notifyOnRegression = false` to prevent the `alert_incidents` row from being created at all.

Rejected: incident records are useful audit data even when no channel is fired. Decoupling creation from delivery means future analytics ("how many regressions did we silently observe?") are answerable from the table alone, and adding a new channel later does not require revisiting the gating semantics. PR 1 creates incidents unconditionally; channel workers do their own gating.

### `incidents` or `alerts` as the Table Name

Considered `incidents` (clean but carries PagerDuty connotation) and `alerts` (overloaded with rule/config language).

Rejected in favor of `alert_incidents`: the `alert_` prefix avoids both connotations, matches repo style (`feature_flags`, `organization_feature_flags`), and stays room-temperature about lifecycle semantics.

### `is_sustained` Discriminator from Day One

One option is to add a column distinguishing one-off incidents from sustained conditions immediately, so `ended_at` semantics are unambiguous.

Rejected: V1 has no sustained kinds. Any choice now is speculative until a real sustained kind arrives. `ended_at` is included as nullable; when the first threshold or anomaly kind ships, the discriminator (or other approach) can be added against concrete behavior.

### Feature Flag in PR 1

One option is to gate `alert_incidents` creation behind an org-level FF from PR 1.

Rejected: PR 1 has no user-visible behavior — incidents are silent records. The FF earns its keep in PR 2 when emails actually reach users. Adding it in PR 1 is defensive but unnecessary noise. The `alerts` FF is introduced in PR 2 and reused by PR 3.

## Implementation Plan

### PR 1: Alert Incidents

**Goal:** Issue lifecycle transitions for `new` and `regressed` produce `alert_incidents` rows. No user-visible delivery.

- Add `alert_incidents` table with the schema above; generate migration via `pnpm pg:generate`
- Add Zod contracts and a repository in `packages/domain/alerts` (or the closest existing home)
- Add domain events `IssueCreated` and `IssueRegressed` to `packages/domain/events`
- Emit `IssueCreated` in `packages/domain/issues/src/use-cases/create-issue-from-score.ts` after `issueRepository.save(issue)`
- In `packages/domain/issues/src/use-cases/assign-score-to-issue.ts`: detect regression (`issue.resolvedAt != null && score.lastSeenAt > issue.resolvedAt`), clear `resolvedAt` on the saved issue, emit `IssueRegressed` with `triggerScoreId`
- Register an `alert-incidents` queue topic in `packages/domain/queue`
- In `apps/workers/src/workers/domain-events.ts`, fan out `IssueCreated` and `IssueRegressed` to the alert-incidents worker
- Create `apps/workers/src/workers/domain-events/alert-incidents.ts`: subscribes, computes dedupe key + severity, inserts row idempotently, emits `IncidentCreated`
- Tests: regression detection clears `resolvedAt`, second regression-causing score after the first does not re-emit, repeated event delivery does not produce duplicate rows

### PR 2: Email Channel

**Goal:** Project members receive a designed, per-kind email when an `alert_incidents` row is created, gated by per-project and per-user settings.

- Extend `projectSettingsSchema` in `packages/domain/shared/src/settings.ts` with `alerts: { notifyOnNewIssue, notifyOnRegression }`
- Add `users.settings: jsonb` column with new `userSettingsSchema` carrying `notifications: { emailEnabled }`; generate migration
- Add the `alerts` org-level feature flag
- Create the email worker subscribed to `IncidentCreated` (in `apps/workers/src/workers/domain-events/alert-emails.ts`): FF check → project setting check → org members → per-user setting check → render template → enqueue email job
- Create per-kind email templates in `packages/domain/email/src/templates/issue-alert/{new,regressed}/index.tsx`, following the magic-link pattern
- Add the project-settings UI section ("Alerts") and the account-settings UI section ("Notifications")
- Tests: end-to-end against Mailpit for both kinds, with FF/project/user gating combinations

### PR 3: In-app Notifications

**Goal:** Users see a feed of alerts in the app with read state.

- Add `notifications` table with `(id, recipient_user_id, alert_incident_id, created_at, seen_at)` and a unique index on `(alert_incident_id, recipient_user_id)`
- Create the notifications worker subscribed to `IncidentCreated` (in `apps/workers/src/workers/domain-events/alert-notifications.ts`): inserts feed entries for each org member; in-app fan-out is unconditional in V1
- In-app notification feed UI with `seen_at` tracking; renders content on read by joining to `alert_incidents` and the source issue
- Tests: feed entry created per member, idempotent on retry, read state persists

## Open Questions

Resolved during V1 scoping:

- Project-level "new issue discovered" fires at `createIssueFromScoreUseCase` save time, not on first row insertion of any candidate
- V1 notifies all organization members; per-project subscribers deferred
- V1 user settings are global per user, not per (user, organization) membership
- V1 stores no email audit log
- V1 incidents have no lifecycle columns
- V1 anomaly checks, saved-search alerts, and issue-scoped alerts are deferred entirely
- `issue.escalating` is deferred from V1 (requires occurrence analytics on the hot write path)
- Severity is stored on `alert_incidents` (hardcoded per kind in V1) rather than derived on read
- `alert_incidents` creation is unconditional in PR 1; channel gating lives in PR 2 (project + user settings) and PR 3 (none)
- Table name is `alert_incidents` (not `incidents`, not `alerts`)
- `ended_at` is nullable and always NULL in V1; sustained-condition semantics decided when the first sustained kind ships
- No feature flag in PR 1; the `alerts` FF is introduced in PR 2

Still open:

- Should V1 send email when the user who triggered a state change is the same recipient? Issue lifecycle transitions are typically system-detected, so this should rarely matter, but worth confirming
- Should V1 expose a separate `inAppEnabled` toggle in `users.settings.notifications`, or is in-app fan-out unconditional for org members? V1 leans unconditional; if disabled in-app is needed later, the jsonb shape accommodates it without a migration
- Should the email and notification workers write a small audit row when they drop a delivery (FF off, settings off), or is silent dropping acceptable? V1 leans silent; `alert_incidents` already records that the alert fired
- Should the saved-search alerts effort that follows V1 reuse the same `alert_incidents` table and `IncidentCreated` event, or introduce its own? Default direction is reuse — same pipeline, more source types
- Which alert surfaces need MCP/API access in the initial product, besides web UI?
