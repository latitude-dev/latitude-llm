export interface EventPayloads {
  MagicLinkEmailRequested: {
    readonly email: string
    readonly magicLinkUrl: string
    readonly emailFlow: string | null
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
  TraceEnded: {
    readonly organizationId: string
    readonly projectId: string
    readonly traceId: string
  }
  ScoreDraftSaved: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly issueId: string | null
  }
  ScorePublished: {
    readonly organizationId: string
    readonly projectId: string
    readonly scoreId: string
    readonly issueId: string | null
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
}
