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
    readonly issueId: string | null
    readonly status: "draft" | "published"
  }
  ScoreAssignedToIssue: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
  }
  /**
   * Emitted by `createIssueFromScoreUseCase` after the issue row is saved.
   * Drives the alert pipeline's `issue.new` incident creation.
   */
  IssueCreated: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly createdAt: string
  }
  /**
   * Emitted by `assignScoreToIssueUseCase` when assigning a score whose
   * `lastSeenAt` is later than the issue's `resolvedAt`. The use case clears
   * `resolvedAt` on the same transaction (reifying the regression as a stored
   * fact); idempotency on subsequent regression-causing scores is enforced by
   * the cleared field, so a second event will not be emitted in the same cycle.
   * `triggerScoreId` discriminates per regression cycle so a future regression
   * after re-resolution is a distinct event.
   */
  IssueRegressed: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly regressedAt: string
    readonly triggerScoreId: string
  }
  /**
   * Emitted by `checkIssueEscalationUseCase` when an issue transitions into
   * the escalating state. The use case does not write the issue itself —
   * idempotency comes from `IssueRepository`'s joined `lifecycle.isEscalating`
   * flag (which reads the open `alert_incidents` row). Drives the
   * `issue.escalating` incident's open transition (the alert-incidents
   * worker inserts the new row).
   */
  IssueEscalated: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly escalatedAt: string
  }
  /**
   * Emitted by `checkIssueEscalationUseCase` when an escalating issue's
   * recent occurrence count drops below the hysteresis exit threshold.
   * Drives the `issue.escalating` incident's close transition — the
   * alert-incidents worker sets `ended_at` on the open row, which is what
   * flips `lifecycle.isEscalating` back to `false` on subsequent reads.
   */
  IssueEscalationEnded: {
    readonly organizationId: string
    readonly projectId: string
    readonly issueId: string
    readonly endedAt: string
  }
  /**
   * Emitted by the alert-incidents worker after an `alert_incidents` row is
   * inserted. PR 1 has no consumer (the dispatcher routes it to a no-op);
   * PR 2 (email) and PR 3 (in-app) will subscribe.
   */
  IncidentCreated: {
    readonly organizationId: string
    readonly projectId: string
    readonly alertIncidentId: string
    readonly kind: "issue.new" | "issue.regressed" | "issue.escalating"
    readonly sourceType: "issue"
    readonly sourceId: string
  }
  AnnotationDeleted: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly issueId: string | null
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
  DatasetCreated: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly datasetId: string
    readonly name: string
  }
  EvaluationConfigured: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly evaluationId: string
    readonly issueId: string
  }
  AnnotationQueueItemCompleted: {
    readonly organizationId: string
    readonly actorUserId: string
    readonly projectId: string
    readonly queueId: string
    readonly itemId: string
  }
  FirstTraceReceived: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
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
   * admin who renamed the account. Issued via Better Auth's
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
  /**
   * Emitted when a platform admin creates a new "demo project" on an
   * organization via the backoffice. The project row is written
   * synchronously by the use-case; the actual seeding (datasets,
   * evaluations, issues, queues, scores, ~30 days of telemetry) runs
   * in a background Temporal workflow — the audit event records the
   * admin's intent at the moment the project was created, not the
   * outcome of the workflow. Reconcile against the workflow handle
   * when investigating a half-seeded project.
   */
  AdminDemoProjectSeeded: {
    readonly adminUserId: string
    readonly organizationId: string
    readonly projectId: string
    readonly projectName: string
  }
}
