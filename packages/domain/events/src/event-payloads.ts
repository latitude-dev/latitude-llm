import type { OrganizationRedactionSetting, RedactionSetting } from "@domain/shared"

/**
 * NOTE: The *Requested events (MagicLinkEmailRequested, InvitationEmailRequested,
 * UserDeletionRequested) use imperative naming that borders on command-dispatch.
 * They originate from Better Auth callbacks where no prior aggregate state
 * transition exists to name the event after, and each has exactly one consumer.
 * Acceptable as pragmatic exceptions at the auth boundary, but do not use this
 * naming pattern for domain-owned aggregates.
 */
export interface EventPayloads {
  MagicLinkEmailRequested: {
    readonly email: string
    readonly magicLinkUrl: string
    readonly organizationId: string
  }
  InvitationEmailRequested: {
    readonly email: string
    readonly invitationUrl: string
    readonly organizationId: string
    readonly organizationName: string
    readonly inviterName: string
  }
  UserDeletionRequested: {
    readonly organizationId: string
    readonly userId: string
  }
  TracesIngested: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceIds: readonly string[]
    /**
     * Resolved once at the top of ingest (`parent_org_id != null`). Consumers
     * branch on it: the LLM fan-out (flaggers, evaluations, signal clustering)
     * does not run for sandbox events. Absent on legacy/replayed events ⇒ live.
     */
    readonly isSandbox?: boolean
    readonly billing?: {
      readonly planSlug: "free" | "pro" | "enterprise"
      readonly planSource: "override" | "subscription" | "free-fallback"
      readonly periodStart: string
      readonly periodEnd: string
      readonly includedCredits: number
      readonly overageAllowed: boolean
    }
  }
  ScoreCreated: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly signalId: string | null
    readonly status: "draft" | "published"
  }
  ScoreAssignedToSignal: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    /**
     * Whether the signal was still a candidate when the score landed, read under
     * the row lock. Carried so the router can route consolidation without a
     * lookup: only a candidate's centroid change is worth a pass, and at volume
     * almost every assignment is to a promoted signal.
     *
     * Absent on events written before this field existed, including any still
     * under the legacy `ScoreAssignedToIssue` name.
     */
    readonly unpromoted?: boolean
  }
  /**
   * Emitted by `createSignalFromScoreUseCase` after the signal row is saved.
   * An audit fact with no consumers — a discovered signal is announced when it
   * is promoted, not when its row appears (see `SignalPromoted`).
   */
  SignalCreated: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly createdAt: string
  }
  /**
   * Emitted when a discovered signal accumulates enough distinct sessions to
   * deserve promotion, from the transaction that observed the evidence. It says
   * the gate passed, nothing more: `promoted_at` is still null and the signal is
   * still invisible.
   *
   * Promotion itself happens downstream, in `issues:promoteSignal`, because the
   * signal has to be named from its whole cluster before it exists for anyone —
   * and that is a model call, which cannot run inside this transaction. Until
   * the latch is stamped, every further score re-qualifies and re-emits this;
   * the consumer's leading throttle collapses those.
   */
  SignalQualifiedForPromotion: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly qualifiedAt: string
    /** The score whose assignment reached the threshold; null when a consolidation merge did. */
    readonly triggerScoreId: string | null
  }
  /**
   * Emitted by `consolidateSignalCandidatesUseCase` from the merge transaction
   * itself, because it is what drives the ClickHouse half of the reassignment.
   *
   * It cannot be a call placed after the commit: the merge is idempotent
   * precisely because a re-run finds the losers soft-deleted and no-ops, so a
   * crash between the two stores would leave the loser's ClickHouse rows under a
   * deleted id forever and the survivor's occurrence count permanently short.
   * At-least-once delivery of this event plus an idempotent mutation is what
   * closes that window.
   *
   * `scoresCreatedFrom` is the oldest `created_at` among the rows Postgres
   * actually moved — the partition bound for the mutation, and the only sound
   * one (a replayed annotation is older than the signal it was assigned to).
   * Null when the merge moved no scores, in which case there is nothing to
   * reconcile.
   */
  SignalsConsolidated: {
    readonly organizationId: string
    readonly projectId: string
    readonly survivorId: string
    readonly loserIds: readonly string[]
    readonly consolidatedAt: string
    readonly scoresMoved: number
    readonly scoresCreatedFrom: string | null
  }
  /**
   * Emitted by `promoteSignalUseCase` from the transaction that stamps
   * `promoted_at`, by which point the signal carries its generated name and
   * description. The latch makes it exactly-once per signal.
   *
   * This is the fact the product acts on: the signal now exists for users, is
   * fully formed, and is ready to be announced. It carries the
   * `signal.discovered` notification and the `signal.discovered` agent dispatch.
   * It is internal: not a notification kind and not a dispatch trigger, it
   * exists only so those two fire on the fact they actually mean.
   */
  SignalPromoted: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly promotedAt: string
  }
  /**
   * Emitted by `updateSignalTriageUseCase` whenever the signal's assignee
   * actually changes (including clears — consumers filter). `assignedAt` is
   * the triage transaction's `now`, frozen into the outbox payload; it is
   * the idempotency anchor for downstream notification dedupe, so a
   * re-assignment (A→B→A) is a distinct event while outbox/queue redelivery
   * of the same event replays identical data.
   */
  SignalAssigneeChanged: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    /** New assignee; `null` when the assignment was cleared. */
    readonly assigneeId: string | null
    readonly previousAssigneeId: string | null
    /** User who performed the triage edit (self-assignments never notify). */
    readonly actorUserId: string
    readonly assignedAt: string
  }
  /**
   * Emitted by `updateSignalTriageUseCase` when a triage edit moves a signal
   * *up* the priority scale. Deliberately narrower than its name: an unset
   * priority ranks below `low`, so setting a first priority emits, while a
   * downgrade, a clear, and a no-op re-save do not — reprioritizing downwards
   * is not news anyone asked for, and the cheapest place to decide that is
   * before the outbox row exists. Widening this to every change means
   * revisiting the `signal.reprioritized` notification, whose topic copy
   * promises escalations only.
   *
   * `reprioritizedAt` is the triage transaction's `now`, frozen into the
   * outbox payload; it is the idempotency anchor for downstream notification
   * dedupe, so each edit is a distinct event while outbox/queue redelivery of
   * the same event replays identical data.
   */
  SignalReprioritized: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    /** The raised-to priority. Never null — clearing a priority is a decrease. */
    readonly priority: string
    /** `null` when the signal had no priority before the edit. */
    readonly previousPriority: string | null
    /** User who performed the triage edit (never notified about their own edit). */
    readonly actorUserId: string
    readonly reprioritizedAt: string
  }
  /**
   * Emitted by `submitSignalFeedbackUseCase` from the transaction that claims
   * the signal's verdict. The claim is guarded on `feedback IS NULL`, so a
   * signal is graded at most once ever and the signal id is a sound idempotency
   * key for the fan-out that labels the flagger generations behind it.
   *
   * Carries the verdict's score triple verbatim: the value the customer gave a
   * signal is the value the flagger's generation is graded with.
   */
  SignalFeedbackSubmitted: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly value: number
    readonly passed: boolean
    readonly feedback: string
  }
  /**
   * Emitted when a new occurrence reopens a manually resolved signal: the
   * reopen claim clears `resolved_at` and stamps `regressed_at`, and exactly
   * one writer per regression cycle emits this (the conditional claim
   * serializes concurrent occurrences). `triggerScoreId` identifies the
   * occurrence that tripped the reopen and discriminates regression cycles
   * for notification idempotency. Drives the `signal.regressed` notification.
   */
  SignalRegressed: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly regressedAt: string
    readonly triggerScoreId: string
  }
  /**
   * Emitted by `checkSignalEscalationUseCase` when a signal transitions into
   * the escalating state. The use case does not write the incident itself —
   * idempotency comes from `SignalRepository`'s joined `lifecycle.isEscalating`
   * flag (which reads the open incident row). The alert-incidents worker
   * inserts the new row.
   *
   * `entrySignals` is the snapshot of seasonal-anomaly signals at the moment
   * of entry, persisted onto the new `alert_incidents` row by the worker so
   * the close-side detector can compare against the conditions that tripped
   * open instead of recomputing live. Shape mirrors `EntrySignalsSnapshot`
   * in `@domain/incidents` — declared inline here to keep `@domain/events`
   * free of an `@domain/incidents` dependency (which would create a cycle).
   * `null` only for historical replay of events emitted before the seasonal
   * detector started snapshotting.
   */
  SignalEscalated: {
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
  /**
   * Emitted by `checkSignalEscalationUseCase` when an escalating signal exits.
   * `reason` discriminates the three exit paths so downstream consumers
   * (notifications copy, observability dashboards) can distinguish a
   * natural band-shape recovery from a forced close:
   *   - `threshold`: the band-shape exit condition held for the full dwell.
   *   - `absolute-rate-drop`: the 24h count fell below the entry-time count
   *     by the configured factor (catches incidents that stayed flat while
   *     the seasonal baseline caught up — wouldn't close on `threshold` alone).
   *   - `timeout`: the 72h hard ceiling kicked in (backstop against
   *     ghost incidents that never recover their snapshot conditions).
   *
   * Drives the signal escalation incident's close transition — the
   * alert-incidents worker sets `ended_at` on the open row, which is what
   * flips `lifecycle.isEscalating` back to `false` on subsequent reads.
   */
  SignalEscalationEnded: {
    readonly organizationId: string
    readonly projectId: string
    readonly signalId: string
    readonly endedAt: string
    readonly reason: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
  }
  /**
   * Emitted by the alert-incidents worker after an `alert_incidents` row is
   * inserted. Consumed by the in-app notifications worker (and, later, by
   * email/Slack channel workers) to fan out to delivery channels.
   */
  IncidentCreated: {
    readonly organizationId: string
    readonly projectId: string
    readonly alertIncidentId: string
    readonly sourceType: "monitor" | "signal"
    readonly sourceId: string
  }
  /**
   * Emitted by the alert-incidents worker after an `alert_incidents` row's
   * `ended_at` is set (only sustained incidents can close). Symmetric to
   * `IncidentCreated`. Consumed by the notifications
   * worker to fire a "closed" notification for the same incident.
   *
   * `reason` mirrors `SignalEscalationEnded.reason` and is forwarded by the
   * worker so observability/notification consumers can distinguish a clean
   * band-shape exit from the backstop and timeout paths. Optional because
   * pre-rewrite events / replays may not carry it; consumers should treat
   * absence as "unknown" rather than "threshold".
   */
  IncidentClosed: {
    readonly organizationId: string
    readonly projectId: string
    readonly alertIncidentId: string
    readonly sourceType: "monitor" | "signal"
    readonly sourceId: string
    readonly reason?: "threshold" | "absolute-rate-drop" | "timeout" | "resolved" | "ignored"
  }
  AnnotationDeleted: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly signalId: string | null
    readonly draftedAt: string | null
    readonly feedback: string
    readonly source: string
    readonly createdAt: string
  }
  OrganizationCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly name: string
    readonly slug: string
  }
  ProjectCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly name: string
    readonly slug: string
  }
  ProjectDeleted: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
  }
  UserSignedUp: {
    readonly userId: string
    readonly email: string
  }
  /**
   * Emitted when a user finishes the project-onboarding form (role + stack
   * choice + free-text job title). Drives the Loops contact update so
   * marketing has `jobTitle` and `userGroup` for newly-onboarded users. The
   * outbox envelope's `organizationId` is `"system"` — onboarding spans the
   * user's identity and isn't tied to a specific tenant. Job title itself is
   * persisted on the `users` row; the worker re-fetches it instead of carrying
   * mutable strings on the event payload.
   */
  UserOnboardingCompleted: {
    readonly userId: string
    readonly stackChoice: "coding-agent-machine" | "production-agent"
  }
  MemberJoined: {
    readonly organizationId: string
    readonly userId: string
    readonly role: string
  }
  MemberInvited: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly email: string
    readonly role: string
  }
  ApiKeyCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly apiKeyId: string
    readonly name: string
  }
  /**
   * Fired when a user approves an OAuth client to act on this organization's
   * behalf (the consent flow's accept branch). Today nothing consumes it; it
   * exists so future MCP-usage analytics can backfill from the outbox.
   */
  OAuthKeyCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly clientId: string
    readonly clientName: string | null
  }
  DatasetCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly datasetId: string
    readonly name: string
  }
  FlaggerToggled: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly flaggerSlug: string
    readonly enabled: boolean
    readonly sampling: number
  }
  /**
   * Emitted when a project's PII redaction policy changes. Audit-only: nothing
   * consumes it. Redaction is destructive, non-retroactive, and unrecoverable,
   * so "who turned this off, and when" has to be answerable after the fact.
   * Both snapshots live in the payload because `projects.settings` is mutable
   * and a delta on it cannot be reconstructed later. Scoped to `redaction`
   * rather than whole-settings blobs so the transition is the payload rather
   * than something a query has to dig out of one.
   */
  ProjectRedactionPolicyChanged: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly fromRedaction: RedactionSetting | null
    readonly toRedaction: RedactionSetting | null
  }
  /** Organization-level twin of `ProjectRedactionPolicyChanged`, including the `locked` flag. */
  OrganizationRedactionPolicyChanged: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly fromRedaction: OrganizationRedactionSetting | null
    readonly toRedaction: OrganizationRedactionSetting | null
  }
  SavedSearchCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly searchId: string
    readonly name: string
  }
  /** Fired when a user confirms a brand-new historical trace import in project settings. */
  ImportStarted: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly importJobId: string
    readonly source: "langfuse" | "langsmith" | "braintrust"
    /** Trace ceiling the user accepted, already clamped to what their plan affords. */
    readonly maxTraces: number
    /** Width of the selected range in days, which is not the age of the data it holds. */
    readonly rangeDays: number
  }
  /**
   * Fired when a user retries a failed or cancelled import. A retry is a new job resuming
   * the old one's cursor and counts, so this is that job's start event rather than a second
   * event about the original — "imports begun" is `ImportStarted` plus `ImportRetried`, and
   * the `ImportFinished` that closes this one carries `importJobId`.
   *
   * The `from*` fields are what make the retry worth its own event: they say whether users
   * are recovering from our failures or restarting their own cancellations, which errors are
   * worth retrying at all, and how much progress a resume actually saves. The config is not
   * repeated — a retry cannot change it, so the original's `ImportStarted` still describes it.
   */
  ImportRetried: {
    readonly organizationId: string
    readonly projectId: string
    /** The new job the retry created, not the one being retried. */
    readonly importJobId: string
    readonly fromJobId: string
    /**
     * `capped` is the interesting one to watch: it separates users continuing an import that
     * ran out of budget from those recovering from a failure.
     */
    readonly fromStatus: "failed" | "cancelled" | "capped"
    /** Why the original stopped; `null` when the user cancelled it cleanly. */
    readonly fromError: string | null
    /** Traces the original run imported and this one resumes on top of. */
    readonly fromTraces: number
  }
  /**
   * Fired once an import reaches a terminal state. `status` carries which one, so a funnel
   * can separate a clean finish from a capped, cancelled or failed run, and `error` says
   * why it did not finish cleanly — a failure reason, or which ceiling stopped a `capped`
   * run (running out of plan usage is an upgrade signal; the user's own limit is not).
   */
  ImportFinished: {
    readonly organizationId: string
    readonly projectId: string
    readonly importJobId: string
    readonly source: "langfuse" | "langsmith" | "braintrust"
    readonly status: "succeeded" | "capped" | "cancelled" | "failed"
    readonly error: string | null
    readonly recordsFetched: number
    readonly sessionsImported: number
    readonly tracesImported: number
    readonly spansImported: number
    readonly spansSkipped: number
    readonly durationMs: number
  }
  /**
   * Fired when a saved search is (soft-)deleted. Drives the monitors source
   * cascade: alerts watching it are soft-deleted and now-empty monitors pruned.
   */
  SavedSearchDeleted: {
    readonly organizationId: string
    readonly projectId: string
    readonly searchId: string
  }
  /**
   * Fired the first time an issue is monitored: a brand-new evaluation
   * generation job has been kicked off (no existing evaluation existed for
   * the issue).
   */
  EvaluationCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly evaluationId: string
    readonly signalId: string
  }
  /**
   * Fired when an existing evaluation for an issue is realigned (re-trained
   * against current annotations / failures). The evaluation row already
   * existed; this is a refresh, not a creation.
   */
  EvaluationAligned: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly evaluationId: string
    readonly signalId: string
  }
  /**
   * Fired (once per health window) when an evaluation's script runs cross the
   * detector-health degradation threshold — it is failing `errors / runs` of
   * its executions, each of which is a silent false negative. Emitted by the
   * live run path; the transition dedupe lives in the detector-health tracker.
   */
  EvaluationDetectorDegraded: {
    readonly organizationId: string
    readonly projectId: string
    readonly evaluationId: string
    readonly runs: number
    readonly errors: number
    readonly windowSeconds: number
  }
  FirstTraceReceived: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
    readonly onboardingType?: "prod-traces" | "code-agents"
  }
  BillingUsagePeriodUpdated: {
    readonly organizationId: string
    readonly periodStart: string
    readonly periodEnd: string
    readonly planSource: "override" | "subscription" | "free-fallback"
    readonly overageAllowed: boolean
    readonly includedCredits: number
    readonly consumedCredits: number
    readonly overageCredits: number
    readonly reportedOverageCredits: number
    /**
     * Thresholds first crossed by this write (free included credits exhausted,
     * Pro entering overage, and/or a configured Pro spend cap). Empty/omitted
     * on ordinary increments so notification fan-out stays once-per-period
     * per kind without re-deriving crossings from every subsequent usage
     * event. Optional so in-flight outbox rows written before this field
     * existed still parse. A single write may include both `overage-started`
     * and `spend-cap` when the cap sits at the included-credit boundary.
     */
    readonly limitsCrossed?: readonly ("included-credits" | "overage-started" | "spend-cap")[]
  }
  /**
   * Emitted when a platform admin begins impersonating another user via
   * the backoffice. The outbox envelope's `organizationId` is always
   * `"system"` — impersonation is a platform-wide audit event with no
   * tenant ownership.
   *
   * `targetOrganizationId` is a **best-effort** hint: it holds the
   * target's first organisation membership (ordered by organisation
   * name) at the moment of impersonation, as surfaced by
   * `AdminUserRepository.findById`. It is NOT guaranteed to be the
   * org the admin actually lands on — Better Auth may set a
   * different `activeOrganizationId` on the new session, and the
   * admin can switch orgs from the banner. Audit queries like "who
   * looked at tenant X?" should treat it as an indicator, not a
   * source of truth — join with the admin's subsequent request trail
   * for definitive answers. `null` when the target has no
   * memberships.
   */
  AdminImpersonationStarted: {
    readonly adminUserId: string
    readonly targetUserId: string
    readonly targetOrganizationId: string | null
  }
  /**
   * Emitted when impersonation ends — either from the "Stop impersonating"
   * banner action or when the 1-hour impersonation-session TTL
   * (`impersonationSessionDuration` on the Better Auth admin plugin)
   * elapses.
   */
  AdminImpersonationStopped: {
    readonly adminUserId: string
    readonly targetUserId: string
  }
  /**
   * Emitted when a platform admin changes another user's `users.role`
   * via the backoffice ("Promote to staff" / "Demote from staff").
   * `fromRole` and `toRole` are stored explicitly so audit queries
   * don't have to reconstruct the transition from a delta on the
   * users table — the row is mutable, so the historical snapshot
   * lives in the event payload.
   */
  AdminUserRoleChanged: {
    readonly adminUserId: string
    readonly targetUserId: string
    readonly fromRole: "user" | "admin"
    readonly toRole: "user" | "admin"
  }
  /**
   * Emitted when a platform admin updates a user's primary email
   * via the backoffice. Snapshot both addresses so audit queries
   * can attribute future logins under the new email back to the
   * admin who renamed the account. Signald via Better Auth's
   * `adminUpdateUser` endpoint, which writes through the internal
   * adapter — `emailVerified` is intentionally left untouched
   * (admins routinely correct typos for users who already verified).
   */
  AdminUserEmailChanged: {
    readonly adminUserId: string
    readonly targetUserId: string
    readonly fromEmail: string
    readonly toEmail: string
  }
  /**
   * Emitted when a platform admin signs a user out of every active
   * session ("Revoke all sessions" in the backoffice). `sessionCount`
   * is captured at the moment of revocation as a best-effort hint —
   * useful for audit queries like "did the admin actually log
   * anybody out, or did the user have no active sessions anyway?"
   * — and intentionally not used as a source of truth (Better Auth
   * could roll up sessions between the listing call and the
   * revocation).
   */
  AdminUserSessionsRevoked: {
    readonly adminUserId: string
    readonly targetUserId: string
    readonly sessionCount: number
  }
  /**
   * Emitted when a platform admin signs a user out of a single
   * session via the per-row Revoke button on the Sessions panel.
   * The session row carries `sessionId` so audit consumers can
   * cross-reference the snapshot the admin saw against the row that
   * was deleted — useful when investigating "which device was
   * disconnected, and from where?". The session token is
   * intentionally NOT included on the event: the row is destroyed
   * immediately and storing the token would needlessly persist a
   * dead authentication credential in the audit log.
   */
  AdminUserSessionRevoked: {
    readonly adminUserId: string
    readonly targetUserId: string
    readonly sessionId: string
  }
  /** Emitted by `claimOrganizationUseCase` after a temp org is adopted. */
  OrganizationClaimed: {
    readonly organizationId: string
    readonly ownerUserId: string
  }
  /**
   * Emitted by `bootstrapOrganizationUseCase` when an email is supplied; drives the claim email.
   * Outbox `organizationId: "system"` like `InvitationEmailRequested` — an auth-boundary email.
   */
  ClaimEmailRequested: {
    readonly email: string
    readonly claimUrl: string
    readonly organizationName: string
    readonly expiresAt: string
  }
}
