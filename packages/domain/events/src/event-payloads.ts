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
  SpanIngested: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
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
  /**
   * Emitted when a platform admin begins impersonating another user via
   * the backoffice. The outbox envelope's `organizationId` is always
   * `"system"` — impersonation is a platform-wide audit event with no
   * tenant ownership. `targetOrganizationId` records the org whose data
   * the admin is about to see (the target user's active org at the
   * moment of impersonation), so queries like "who looked at tenant X?"
   * have a join key.
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
}
