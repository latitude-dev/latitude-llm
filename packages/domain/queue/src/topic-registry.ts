import type { DomainEvent } from "@domain/events"
import type { SerializedRedactionPolicy } from "@domain/shared"

/**
 * Phantom type helper: returns an empty object at runtime but carries type T
 * at compile time. This lets us define the registry as a single const object
 * from which both TopicRegistry (the type) and TOPIC_NAMES (runtime) are derived.
 */
function payloads<T extends Record<string, unknown>>(): T {
  return {} as T
}

const _registry = {
  "domain-events": payloads<{
    dispatch: {
      readonly id: string
      readonly event: DomainEvent
      readonly occurredAt: string
    }
  }>(),

  "magic-link-email": payloads<{
    send: {
      readonly email: string
      readonly magicLinkUrl: string
      readonly organizationId: string
    }
  }>(),

  "invitation-email": payloads<{
    send: {
      readonly email: string
      readonly invitationUrl: string
      readonly organizationId: string
      readonly organizationName: string
      readonly inviterName: string
    }
  }>(),

  "organization-claim-email": payloads<{
    send: {
      readonly email: string
      readonly claimUrl: string
      readonly organizationName: string
      readonly expiresAt: string
    }
  }>(),

  "organization-cleanup": payloads<{
    /** Fired by a daily cron — hard-deletes temporary orgs past their claim deadline. */
    reapExpired: Record<string, never>
  }>(),

  showcase: payloads<{
    /**
     * Fired by a daily off-peak cron — builds a fresh `next` showcase project,
     * gates it, and auto-swaps the pointer (S4). No payload: the handler reads
     * the pointer to resolve the showcase org and re-anchors to "now".
     */
    regenerate: Record<string, never>
    /**
     * Retire + self-heal (S5). Reclaims a wedged `building` pointer and retires
     * every showcase-org project that is neither `current` nor `next` via the
     * standard PG soft-delete + `ProjectDeleted` path (ClickHouse telemetry ages
     * out via the retention TTL, as for any deleted project). Fired both by a
     * daily cron and by the regeneration workflow right after a swap (to promptly
     * retire the just-swapped-out `current`). No payload: the handler reads the
     * pointer.
     */
    cleanup: Record<string, never>
  }>(),

  "user-deletion": payloads<{
    delete: {
      readonly organizationId: string
      readonly userId: string
    }
  }>(),

  "span-ingestion": payloads<{
    ingest: {
      readonly fileKey: string | null
      readonly inlinePayload: string | null
      readonly contentType: string
      readonly organizationId: string
      readonly apiKeyId: string
      readonly ingestedAt: string
      readonly defaultProjectId: string | null
      readonly projectIdBySlug: Readonly<Record<string, string>>
      readonly isSandbox?: boolean
      /**
       * Redaction policy per project id, resolved at the ingest boundary where each
       * project's settings are already loaded for sampling. Projects resolving to
       * `off` are absent and the field is omitted when no project opted in, so a
       * missing field means "redact nothing" — which is what makes this field safe
       * to deploy in either order and is why the worker needs no legacy fallback.
       */
      readonly redaction?: Readonly<Record<string, SerializedRedactionPolicy>>
    }
  }>(),

  exports: payloads<{
    generate: {
      readonly kind: "dataset" | "traces" | "issues"
      readonly organizationId: string
      readonly projectId: string
      readonly recipientEmail: string
      // Shared selection fields
      readonly selection?:
        | { readonly mode: "selected"; readonly rowIds: readonly string[] }
        | { readonly mode: "all" }
        | { readonly mode: "allExcept"; readonly rowIds: readonly string[] }
      // Dataset-specific fields
      readonly datasetId?: string
      // Traces-specific fields - uses FilterSet shape
      readonly filters?: Readonly<Record<string, readonly { readonly op: string; readonly value: unknown }[]>>
      // Signals-specific fields
      readonly lifecycleGroup?: "active" | "archived"
      readonly searchQuery?: string
      readonly timeRange?: {
        readonly fromIso?: string
        readonly toIso?: string
      }
      readonly sort?: {
        readonly field: "lastSeen" | "occurrences" | "affectedSessions" | "state"
        readonly direction: "asc" | "desc"
      }
    }
  }>(),

  notifications: payloads<{
    /**
     * Producer step for incidents. Fired by the domain-events router on
     * `IncidentCreated` / `IncidentClosed`. `transition` is the lifecycle
     * hint from the originating outbox event; the consumer loads the
     * incident, derives the notification kind from its `endedAt`
     * (event / opened / closed), applies the project-level alert-kind
     * gate, snapshots the trend window for sustained kinds, resolves
     * recipients, and emits N `create-notification` tasks.
     */
    "request-incident-notifications": {
      readonly organizationId: string
      readonly alertIncidentId: string
      readonly transition: "created" | "closed"
    }
    /**
     * Producer step for Wrapped reports. Fired by the wrapped worker
     * after a report is generated. The consumer resolves recipients and
     * emits N `create-notification` tasks.
     */
    "request-wrapped-report-notifications": {
      readonly organizationId: string
      readonly projectId: string
      readonly wrappedReportId: string
      readonly link: string
    }
    /**
     * Producer step for issue assignments. Fired by the domain-events
     * router on `SignalAssigneeChanged` (cleared assignments and
     * self-assignments are filtered before publish). The consumer
     * re-checks those rules, re-fetches the issue for the project anchor,
     * and emits exactly one `create-notification` task targeting the new
     * assignee. Never fans out to Slack — `personal` is not slack-routable.
     */
    "request-signal-assigned-notifications": {
      readonly organizationId: string
      readonly signalId: string
      readonly assigneeId: string
      readonly actorUserId: string
      /** ISO timestamp frozen by the triage transaction; idempotency anchor. */
      readonly assignedAt: string
    }
    /**
     * Producer step for signal discovery. Fired by the domain-events router
     * on `SignalCreated`; the consumer resolves org-member recipients and
     * emits one `create-notification` task per recipient.
     */
    "request-signal-discovered-notifications": {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly discoveredAt: string
    }
    /**
     * Producer step for signal regression. Fired by the domain-events router
     * on `SignalRegressed` (a new occurrence reopened a resolved signal); the
     * consumer skips muted signals, resolves recipients (assignee-first), and
     * emits one `create-notification` task per recipient.
     */
    "request-signal-regressed-notifications": {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly regressedAt: string
      readonly triggerScoreId: string
    }
    /**
     * Producer step for destination quarantine. Fired directly by the
     * destinations worker when a `(destination, source)` sync flip
     * quarantines the destination (5 consecutive terminal failures). The
     * consumer honors the project-level gate, resolves org-member recipients,
     * and emits N `create-notification` tasks. `quarantinedAt` is the
     * per-occurrence idempotency anchor (a recovery + re-quarantine notifies
     * again); `destinationName`/`destinationKind` are snapshotted because the
     * bell has no live destination resolver.
     */
    "request-destination-quarantined-notifications": {
      readonly organizationId: string
      readonly projectId: string
      readonly destinationId: string
      readonly destinationName: string
      readonly destinationKind: string
      readonly quarantinedAt: string
      readonly failureMessage: string | null
    }
    /**
     * Producer step for billing limit alerts. Fired by the domain-events
     * router once per entry in `BillingUsagePeriodUpdated.limitsCrossed`
     * (free included credits, Pro overage entry, or Pro spend cap). The
     * consumer fans out to owners/admins only and emits one
     * `create-notification` per recipient.
     */
    "request-billing-limit-notifications": {
      readonly organizationId: string
      readonly periodStart: string
      readonly periodEnd: string
      readonly limitKind: "included-credits" | "overage-started" | "spend-cap"
      readonly includedCredits: number
      readonly consumedCredits: number
      readonly overageCredits: number
    }
    /**
     * Creator step. One message per recipient. The consumer writes the
     * in-app row idempotently via the `(org_id, user_id, idempotency_key)`
     * unique index and then fans out to channel-specific delivery jobs
     * (e.g. `notification-email`) when user preferences allow.
     *
     * `kind` matches `NotificationKind` from `@domain/notifications`;
     * `payload` matches that kind's per-kind payload schema. We keep
     * them as `string` / `Record<string, unknown>` here so this package
     * stays free of a dep on `@domain/notifications`. Consumers validate
     * with `payloadSchemaFor(kind).parse(payload)`.
     *
     * `projectId` is the cascade anchor: `null` for kinds with no
     * natural project (`custom.message`), set for incident/wrapped kinds.
     */
    "create-notification": {
      readonly organizationId: string
      readonly userId: string
      readonly notificationId: string
      readonly kind: string
      readonly idempotencyKey: string
      readonly projectId: string | null
      readonly payload: Record<string, unknown>
    }
    /**
     * Cascade cleanup. Fired by the domain-events worker on
     * `ProjectDeleted`. The consumer deletes every notification anchored
     * to the project from the bell feed across all users.
     */
    "delete-by-project": {
      readonly organizationId: string
      readonly projectId: string
    }
  }>(),

  "notification-email": payloads<{
    /**
     * Emailer step. Fired by the notifications worker after the in-app
     * row was inserted AND the recipient's preferences allow email for
     * the kind's group. The consumer renders the per-kind email template
     * and sends via the email transport, conditionally stamping
     * `emailed_at` on the row (the WHERE-clause guard absorbs
     * at-least-once redelivery).
     */
    send: {
      readonly organizationId: string
      readonly notificationId: string
    }
  }>(),

  "notification-slack": payloads<{
    /**
     * Slack channel delivery step. One job per (notification occurrence,
     * configured route). Unlike `notification-email`, this is **not**
     * per-recipient — Slack is org-level routing, so the producer fans
     * out one job per channel in `slack_integration_details.routes[group]`
     * regardless of per-user preferences. Idempotency is enforced by
     * the worker via `slack_deliveries (idempotency_key, channel_id)`.
     *
     * `payload` is the per-kind payload (matches `NOTIFICATION_KIND_META[kind].payload`).
     * `notificationId` is included when the occurrence wrote an in-app
     * row (incidents, wrapped) so deep links can target it; `null` for
     * kinds that bypass the bell feed (none today, but optional for
     * future kinds).
     */
    send: {
      readonly organizationId: string
      readonly integrationId: string
      readonly channelId: string
      readonly kind: string
      readonly payload: Record<string, unknown>
      readonly idempotencyKey: string
      readonly projectId: string | null
      readonly notificationId: string | null
    }
  }>(),

  "agent-dispatch": payloads<{
    request: {
      readonly organizationId: string
      readonly projectId?: string
      readonly signalId?: string
      readonly alertIncidentId?: string
      readonly source: "signal" | "incident"
      /** Signal-source trigger; omitted means `signal.discovered`. */
      readonly trigger?: "signal.discovered" | "signal.regressed"
    }
    send: {
      readonly organizationId: string
      readonly projectId: string
      readonly configId: string
      readonly integrationId: string
      readonly kind: string
      readonly idempotencyKey: string
      readonly trigger: string
      readonly sourceType: "signal" | "monitor"
      readonly sourceId: string
      readonly prompt: string
      readonly context: Record<string, unknown>
      readonly target: Record<string, unknown>
    }
  }>(),

  // Inbound GitHub App webhook events, slim-extracted by the receiver (5.7). Never carries a raw
  // payload — the receiver caps commit messages and count before enqueueing. Routed to the org by
  // `installationId`; `pull-request`/`push` are stubbed in Phase 1 to ledger-claim + skip.
  "github-events": payloads<{
    "pull-request": {
      readonly deliveryId: string
      readonly installationId: number
      readonly repoId: number
      readonly repoFullName: string
      readonly action: string
      readonly prNumber: number
      readonly title: string
      readonly body: string | null
      readonly state: string
      readonly draft: boolean
      readonly merged: boolean
      readonly mergeCommitSha: string | null
      readonly mergedAt: string | null
      readonly headRef: string
      readonly headSha: string
      readonly headRepoId: number | null
      readonly baseRef: string
      readonly htmlUrl: string
      readonly userLogin: string
      readonly authorAssociation: string
      /** Present only on `edited` retargets — the previous base ref. */
      readonly changesBaseRef: string | null
    }
    push: {
      readonly deliveryId: string
      readonly installationId: number
      readonly repoId: number
      readonly repoFullName: string
      readonly defaultBranch: string
      readonly ref: string
      readonly before: string
      readonly after: string
      readonly created: boolean
      readonly deleted: boolean
      readonly forced: boolean
      readonly commits: readonly {
        readonly id: string
        readonly message: string
        readonly timestamp: string
        readonly authorUsername: string | null
        readonly url: string
      }[]
      /** commits[] hit the per-push cap or GitHub's truncation; the API walk (Phase 5) completes it. */
      readonly truncated: boolean
    }
    installation: {
      readonly deliveryId: string
      readonly installationId: number
      readonly event: "installation" | "installation_repositories"
      readonly action: string
      readonly accountLogin: string
      readonly accountType: string
      readonly repositorySelection: string
    }
    "delete-by-project": {
      readonly organizationId: string
      readonly projectId: string
    }
  }>(),

  "alert-incidents": payloads<{
    "signal-escalated": {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly escalatedAt: string
      readonly entrySignals: {
        readonly expected1h: number
        readonly expected6hPerHour: number
        readonly stddev1h: number
        readonly stddev6hPerHour: number
        readonly kShort: number
        readonly kLong: number
        readonly entryThreshold1h: number
        readonly entryThreshold6hPerHour: number
        readonly entryCount24h: number
      } | null
    }
    "signal-escalation-ended": {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly endedAt: string
      readonly reason: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
    }
  }>(),

  issues: payloads<{
    discovery: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
      readonly signalId: string | null
    }
    refresh: {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
    }
    checkEscalation: {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
    }
    /**
     * Fired by the hourly cron — finds every open signal incident
     * and fans out one `checkEscalation` per signal. Recovers stuck-open
     * incidents whose 1h debounce already fired once and decided "still
     * escalating" while the burst was still inside the 6h window.
     */
    sweepEscalating: Record<string, never>
    removeScore: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
      readonly signalId: string | null
      readonly draftedAt: string | null
      readonly feedback: string
      readonly source: string
      readonly createdAt: string
    }
  }>(),

  monitors: payloads<{
    /**
     * Run the monitor firing pipeline for one project. Published throttled
     * (per project) on trace-end and fanned out by the 5-minute sweep. The
     * handler lists active monitors and runs each one's state machine.
     */
    checkSavedSearchMonitors: {
      readonly organizationId: string
      readonly projectId: string
    }
    /** Fired by the 5-minute cron — fans out one `checkSavedSearchMonitors` per project with active monitors. */
    sweepSavedSearchMonitors: Record<string, never>
    /**
     * Source-deletion cascade. Fired by the domain-events router on
     * `SavedSearchDeleted`. Soft-deletes monitors watching the source and closes
     * open monitor incidents.
     */
    onSourceDeleted: {
      readonly organizationId: string
      readonly projectId: string
      readonly sourceType: "savedSearch" | "issue"
      readonly sourceId: string
    }
  }>(),

  evaluations: payloads<{
    automaticRefreshAlignment: {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly evaluationId: string
    }
    automaticOptimization: {
      readonly organizationId: string
      readonly projectId: string
      readonly signalId: string
      readonly evaluationId: string
    }
  }>(),

  "annotation-scores": payloads<{
    publishHumanAnnotation: {
      readonly organizationId: string
      readonly projectId: string
      readonly scoreId: string
    }
  }>(),

  scores: payloads<{
    "delete-analytics": {
      readonly organizationId: string
      readonly scoreId: string
    }
  }>(),

  "live-evaluations": payloads<{
    execute: {
      readonly organizationId: string
      readonly projectId: string
      readonly evaluationId: string
      readonly traceId: string
      /**
       * Readiness-gate re-publish counter for embedding-capability evaluations. Absent on the initial
       * publish; incremented each time the run defers because ingest-time embeddings aren't indexed yet.
       */
      readonly embeddingWaitAttempt?: number
    }
  }>(),

  "trace-end": payloads<{
    run: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly isSandbox?: boolean
    }
  }>(),

  // Session-level dispatch: each settled trace-end enqueues this with a session-keyed dedupeKey and a
  // debounce, so repeated trace-ends collapse to one firing once the session goes quiet. Carries the
  // latest trace of the session (debounce replaces the pending payload) for the trace-scoped work it
  // fans out (signals:match, session analysis).
  "session-end": payloads<{
    run: {
      readonly organizationId: string
      readonly projectId: string
      readonly sessionId: string
      readonly latestTraceId: string
      readonly latestTraceStartTime: string
      readonly isSandbox?: boolean
    }
  }>(),

  // The unified evaluation matching pipeline: runs a project's active evaluations against an
  // ingested trace (sampling/turn/filter selection) and fans out live-evaluations:execute jobs.
  // Replaces trace-end's evaluation fan-out for all signals. Never enqueued for sandbox traces.
  signals: payloads<{
    match: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly isSandbox?: boolean
      /** "embeddings-ready" re-triggers are filtered to semantic evals; absent/"ingest" is the trace-end pass. */
      readonly reason?: "ingest" | "embeddings-ready"
    }
  }>(),

  // On-demand builder preview: compiles a draft evaluation and runs it against the latest matching
  // sessions WITHOUT persisting a score, writing the result to Redis for the web client to poll.
  // `evaluation`/`filters` are JSON-shaped here and re-validated by previewEvaluationUseCase's schema.
  "signals-preview": payloads<{
    run: {
      readonly previewId: string
      readonly organizationId: string
      readonly projectId: string
      readonly evaluation: { readonly settings: unknown } | { readonly script: string }
      readonly filters?: unknown
    }
  }>(),

  // Describe-first signal creation: AI drafts the complete signal (name, description, filters,
  // sampling, evaluation) from a freeform prompt, previews it against recent sessions, and creates
  // it. Runs in a worker (AI + sandbox + ClickHouse + Postgres); progress and the final result are
  // written to Redis for the web client to poll. `filters` is JSON-shaped and re-validated downstream.
  "signals-generate-signal": payloads<{
    run: {
      readonly generationId: string
      readonly organizationId: string
      readonly projectId: string
      readonly prompt: string
      readonly filters?: unknown
    }
  }>(),

  // Materializes a settled trace's memory-operation spans into the memory ledger
  // (memory_events / memory_blobs / memory_current). Fanned out from trace-end as
  // an isolated failure domain.
  "memory-projection": payloads<{
    run: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly sessionId: string
    }
  }>(),

  // Starts the session flagger screening workflow, published by the moments
  // persist activity per recorded generation. The dedupe key MUST include the
  // analysis hash — a bare per-session jobId shadows later generations.
  "flagger-screening": payloads<{
    start: {
      readonly organizationId: string
      readonly projectId: string
      readonly sessionId: string
      readonly analysisHash: string
    }
  }>(),

  projects: payloads<{
    provision: {
      readonly organizationId: string
      readonly projectId: string
      readonly name: string
      readonly slug: string
    }
    checkFirstTrace: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
    }
  }>(),

  "api-keys": payloads<{
    create: {
      readonly organizationId: string
      readonly name: string
    }
  }>(),

  "posthog-analytics": payloads<{
    track: {
      readonly eventName: string
      readonly organizationId: string
      readonly payload: Record<string, unknown>
      readonly occurredAt: string
    }
  }>(),

  // Outbound contact lifecycle sync to the marketing tool (Loops in v2). Each
  // task targets a specific contact update; they are dispatched from
  // `domain-events` as users move through signup, organization creation,
  // onboarding, and first-trace.
  "marketing-contacts": payloads<{
    "register-user": {
      readonly userId: string
    }
    "update-onboarding": {
      readonly userId: string
      readonly stackChoice: "coding-agent-machine" | "production-agent"
    }
    "mark-telemetry-enabled": {
      readonly organizationId: string
    }
  }>(),

  "trace-search": payloads<{
    refreshTrace: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceId: string
      readonly startTime: string
      readonly rootSpanName: string
      readonly isSandbox?: boolean
    }
  }>(),

  taxonomy: payloads<{
    gardenProject: {
      readonly organizationId: string
      readonly projectId: string
      readonly reason: "cron" | "manual" | "threshold"
    }
    gardenSweep: {
      readonly triggeredAt: string
    }
    gardenCustomBehavior: {
      readonly organizationId: string
      readonly projectId: string
      readonly customBehaviorId: string
      readonly reason?: "manual" | "cron"
    }
    gardenCustomBehaviorSweep: {
      /** Optional override for ad-hoc runs; the repeatable sweep anchors at execution time instead. */
      readonly triggeredAt?: string
    }
  }>(),

  billing: payloads<{
    recordBillableAction: {
      readonly organizationId: string
      readonly projectId: string
      readonly action: "trace" | "eval-scan" | "semantic-query" | "llm-call"
      readonly idempotencyKey: string
      readonly context: {
        readonly planSlug: "free" | "pro" | "enterprise"
        readonly planSource: "override" | "subscription" | "free-fallback"
        readonly periodStart: string
        readonly periodEnd: string
        readonly includedCredits: number
        readonly overageAllowed: boolean
      }
      readonly traceId?: string
      readonly metadata?: Record<string, unknown>
    }
    recordTraceUsageBatch: {
      readonly organizationId: string
      readonly projectId: string
      readonly traceIds: readonly string[]
      readonly planSlug: "free" | "pro" | "enterprise"
      readonly planSource: "override" | "subscription" | "free-fallback"
      readonly periodStart: string
      readonly periodEnd: string
      readonly includedCredits: number
      readonly overageAllowed: boolean
      readonly isSandbox?: boolean
    }
  }>(),

  "billing-overage": payloads<{
    reportOverage: {
      readonly organizationId: string
      readonly periodStart: string
      readonly periodEnd: string
      /**
       * Cumulative `overageCredits` observed when this report was enqueued.
       * The worker reports up to this value (not "current O at job-read time")
       * so retries are stable: the Stripe meter-event identifier is derived
       * from this snapshot, and bullmq retries reuse the same payload, which
       * makes Stripe deduplicate retries even after additional accrual. The
       * pending job may be replaced with a newer snapshot before it fires, but
       * the fired payload stays stable across retries.
       */
      readonly snapshotOverageCredits: number
    }
  }>(),

  // Writes annotations into the Latitude-owned dogfood project via
  // @platform/latitude-api. The worker is fire-and-forget from the reviewer's
  // perspective — the web route 202s immediately on enqueue, and BullMQ's
  // retry policy drives redelivery on transient failures.
  "product-feedback": payloads<{
    submitSystemAnnotatorReview: {
      readonly upstreamScoreId: string
      // Discriminated at the type level: reject requires a comment, approve does
      // not. Mirrors the Phase 5 UI's disabled-submit behaviour on reject.
      readonly review:
        | { readonly decision: "approve"; readonly comment?: string }
        | { readonly decision: "reject"; readonly comment: string }
    }
    submitEnrichmentReview: {
      readonly upstreamScoreId: string
      readonly review:
        | { readonly decision: "good"; readonly comment?: string }
        | { readonly decision: "bad"; readonly comment: string }
    }
  }>(),

  // Weekly Wrapped digest. `triggerWeeklyRun` is fired by a BullMQ
  // repeatable schedule; the handler derives the 7-day window from
  // Date.now() and fans out one `runForProject` per eligible
  // (type, orgId, projectId) tuple. The manual backoffice button
  // publishes `runForProject` directly. Today the only `type` value
  // is `"claude_code"`; future Wrapped types (Openclaw, Codex, …)
  // publish on the same topic with their own `type` discriminator.
  wrapped: payloads<{
    triggerWeeklyRun: Record<string, never>
    runForProject: {
      readonly type: string
      readonly organizationId: string
      readonly projectId: string
      readonly windowStartIso: string
      readonly windowEndIso: string
    }
  }>(),

  sandboxes: payloads<{
    archiveIdle: Record<string, never>
  }>(),

  destinations: payloads<{
    /**
     * Fired every minute by a repeatable schedule. Selects active destinations
     * due for a sync (idle backoff applied, sandbox orgs excluded) and fans out
     * one `runSync` per due destination.
     */
    sweep: Record<string, never>
    /**
     * Fired nightly by a repeatable schedule. Deletes `destination_sync_runs`
     * audit rows finished more than the retention window ago. Separate from the
     * every-minute sweep because retention is coarse (30d).
     */
    pruneSyncRuns: Record<string, never>
    /**
     * One sync run for a single `(destination, source)` pair. The handler
     * re-loads the destination and the source cursor, reads that source's
     * window, maps and delivers it, then advances the per-source compound
     * cursor. Published with `dedupeKey: destinations:runSync:${destinationId}:${source}`
     * so at most one run per pair is queued; retryable delivery failures drive
     * BullMQ backoff.
     */
    runSync: {
      readonly organizationId: string
      readonly projectId: string
      readonly destinationId: string
      readonly source: string
    }
    /**
     * Cascade cleanup. Fired by the domain-events worker on `ProjectDeleted`.
     * The consumer deletes the project's destinations and their sync runs so
     * the sweep stops exporting the deleted project's residual ClickHouse data.
     */
    "delete-by-project": {
      readonly organizationId: string
      readonly projectId: string
    }
  }>(),

  // Separate queue from `destinations` so backfill runs in a capped, low-concurrency
  // lane (subscribed with its own `concurrency`) and can never starve live sync.
  "destinations-backfill": payloads<{
    /**
     * Initiates a user-requested backfill for one `(destination, source)` pair.
     * The handler resolves the org's retention window, clamps `since` to it,
     * computes the historical / live segments, and enqueues the first
     * `runBackfillWindow`. `since` is ISO; omit for "as far back as retained".
     */
    backfill: {
      readonly organizationId: string
      readonly projectId: string
      readonly destinationId: string
      readonly source: string
      readonly since?: string
      /** Upper bound (ISO); where existing coverage begins. Omit ⇒ the use case declines to backfill (never runs unbounded to `now`). */
      readonly until?: string
    }
    /**
     * One bounded backfill window. The handler delivers it through the same
     * read→map→deliver path as `runSync`, writes a `backfill`-tagged sync run,
     * and re-enqueues the next window until the range is exhausted — a paced,
     * resumable, idempotent chain. All dates are ISO; `remainingSegments` is the
     * queue of slices still to process after the current one.
     */
    runBackfillWindow: {
      readonly organizationId: string
      readonly projectId: string
      readonly destinationId: string
      readonly source: string
      readonly cursorWatermark: string
      readonly cursorId: string
      /** Empty/omitted for jobs created before the trace-scoped span cursor was added. */
      readonly cursorTraceId?: string
      readonly segmentEnd: string
      readonly remainingSegments: readonly { readonly start: string; readonly end: string }[]
      /** The chain's lower bound (ISO); coverage extends to it once the chain drains. */
      readonly coverageFloor: string
    }
  }>(),

  imports: payloads<{
    start: {
      readonly organizationId: string
      readonly projectId: string
      readonly importJobId: string
    }
    fetchPage: {
      readonly organizationId: string
      readonly projectId: string
      readonly importJobId: string
      /** Consecutive `Retry-After` waits already spent on this page; bounded, carried in the payload. */
      readonly rateLimitWaits?: number
    }
    /** Cascade cleanup fired by the domain-events router on `ProjectDeleted`. */
    "delete-by-project": {
      readonly organizationId: string
      readonly projectId: string
    }
  }>(),
}

export type TopicRegistry = typeof _registry
export const TOPIC_NAMES = Object.keys(_registry) as (keyof TopicRegistry & string)[]
