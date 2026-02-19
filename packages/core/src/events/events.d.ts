import {
  ActiveEvaluation,
  AlignmentMetricMetadata,
} from '@latitude-data/constants/evaluations'
import { CostBreakdown } from '@latitude-data/constants/costs'
import { ExperimentVariant } from '@latitude-data/constants/experiments'
import { ModifiedDocumentType } from '@latitude-data/constants/history'
import { SpanType } from '@latitude-data/constants/tracing'
import { type Commit } from '../schema/models/types/Commit'
import { type Dataset } from '../schema/models/types/Dataset'
import { type DatasetRow } from '../schema/models/types/DatasetRow'
import { type DeploymentTest } from '../schema/models/types/DeploymentTest'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Experiment } from '../schema/models/types/Experiment'
import { type MagicLinkToken } from '../schema/models/types/MagicLinkTokens'
import { type Membership } from '../schema/models/types/Membership'
import { type Project } from '../schema/models/types/Project'
import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import {
  DatasetV2,
  EvaluationResultV2,
  EvaluationV2,
  Message,
} from '../schema/types'

export type Events =
  | 'magicLinkTokenCreated'
  | 'userCreated'
  | 'userOnboardingInfoUpdated'
  | 'membershipCreated'
  | 'experimentVariantsCreated'
  | 'workspaceCreated'
  | 'workspaceFinishingFreeTrial'
  | 'projectCreated'
  | 'sendReferralInvitation'
  | 'claimReferralInvitations'
  | 'datasetCreated'
  | 'datasetUploaded'
  | 'providerApiKeyCreated'
  | 'providerApiKeyDestroyed'
  | 'providerApiKeyUpdated'
  | 'userInvited'
  | 'commitCreated'
  | 'commitPublished'
  | 'commitMerged'
  | 'commitDeleted'
  | 'documentCreated'
  | 'documentsDeleted'
  | 'documentRunRequested'
  | 'chatMessageRequested'
  | 'copilotSuggestionGenerated'
  | 'copilotSuggestionApplied'
  | 'evaluationV2Created'
  | 'evaluationV2Updated'
  | 'evaluationV2AlignmentUpdated'
  | 'evaluationV2Deleted'
  | 'evaluationV2Ran'
  | 'evaluationV2Annotated'
  | 'evaluationResultV2Created'
  | 'evaluationResultV2Updated'
  | 'webhookDeliveryCreated'
  | 'exportReady'
  | 'spanCreated'
  | 'segmentCreated'
  | 'segmentUpdated'
  | 'actionExecuted'
  | 'toolExecuted'
  | 'documentTriggerUndeployRequested'
  | 'documentTriggerCreated'
  | 'documentTriggerDeleted'
  | 'documentTriggerEventCreated'
  | 'promocodeClaimed'
  | 'subscriptionUpdated'
  | 'subscriptionEnqueuedForCancellation'
  | 'stripeCustomerIdAssigned'
  | 'stripeCustomerIdUnassigned'
  | 'documentRunQueued'
  | 'documentRunStarted'
  | 'documentRunProgress'
  | 'documentRunEnded'
  | 'issueCreated'
  | 'issueUpdated'
  | 'issueDeleted'
  | 'issueIncremented'
  | 'issueDecremented'
  | 'issueDiscovered'
  | 'issueMerged'
  | 'issueResolved'
  | 'issueUnresolved'
  | 'issueIgnored'
  | 'issueUnignored'
  | 'weeklyEmailPreferenceUpdated'
  | 'escalatingIssuesEmailPreferenceUpdated'
  | 'workspaceIssuesDashboardUnlocked'
  | 'deploymentTestCreated'
  | 'weeklyWorkspacesNotifiedTotal'
  | 'weeklyWorkspaceNotified'
  | 'optimizationStarted'
  | 'optimizationPrepared'
  | 'optimizationExecuted'
  | 'optimizationValidated'
  | 'optimizationEnded'

export type LatitudeEventGeneric<
  U extends Events,
  T extends Record<string, unknown>,
> = {
  type: U
  data: T
}

export type EventHandler<E extends LatitudeEvent> = ({
  data,
}: {
  data: E
}) => void

export type MagicLinkTokenCreated = LatitudeEventGeneric<
  'magicLinkTokenCreated',
  MagicLinkToken & { userEmail: string; returnTo?: string }
>
export type UserCreatedEvent = LatitudeEventGeneric<
  'userCreated',
  User & { workspaceId: number; userEmail: string }
>
export type UserOnboardingInfoUpdatedEvent = LatitudeEventGeneric<
  'userOnboardingInfoUpdated',
  User & { userEmail: string }
>
export type MembershipCreatedEvent = LatitudeEventGeneric<
  'membershipCreated',
  Membership & { authorId?: string; userEmail?: string }
>
export type ExperimentVariantsCreatedEvent = LatitudeEventGeneric<
  'experimentVariantsCreated',
  {
    userEmail: string
    workspaceId: number
    documentUuid: string
    commitUuid: string
    variants: ExperimentVariant[]
  }
>

type StreamTextData = {
  toolCalls: {
    id: string
    name: string
    arguments: unknown[]
  }[]
  responseText: string
}
type StreamObjectData = {
  responseObject: unknown
}
export type WorkspaceCreatedEvent = LatitudeEventGeneric<
  'workspaceCreated',
  {
    workspace: Workspace
    user: User
    userEmail: string
    workspaceId: number
    source: string
  }
>

export type ProjectCreatedEvent = LatitudeEventGeneric<
  'projectCreated',
  {
    project: Project
    commit: Commit
    userEmail: string
    workspaceId: number
  }
>

export type CommitCreatedEvent = LatitudeEventGeneric<
  'commitCreated',
  {
    commit: Commit
    userEmail: string
    workspaceId: number
  }
>

export type SendReferralInvitationEvent = LatitudeEventGeneric<
  'sendReferralInvitation',
  {
    email: string
    workspaceId: number
    userId: string
  }
>

export type PromocodeClaimedEvent = LatitudeEventGeneric<
  'promocodeClaimed',
  {
    workspaceId: number
    promocode: Promocode
  }
>

export type ClaimReferralInvitationEvent = LatitudeEventGeneric<
  'claimReferralInvitations',
  {
    newUser: User
  }
>

export type DatasetCreatedEvent = LatitudeEventGeneric<
  'datasetCreated',
  {
    dataset: Dataset
    userEmail: string
    workspaceId: number
  }
>

export type DatasetV2CreatedEvent = LatitudeEventGeneric<
  'datasetUploaded',
  {
    workspaceId: number
    datasetId: number
    userEmail: string
    fileKey: string
    csvDelimiter: string
  }
>

export type ProviderApiKeyCreatedEvent = LatitudeEventGeneric<
  'providerApiKeyCreated',
  {
    providerApiKey: ProviderApiKey
    userEmail: string
    workspaceId: number
  }
>

export type ProviderApiKeyDestroyedEvent = LatitudeEventGeneric<
  'providerApiKeyDestroyed',
  {
    providerApiKey: ProviderApiKey
    workspaceId: number
  }
>

export type ProviderApiKeyUpdatedEvent = LatitudeEventGeneric<
  'providerApiKeyUpdated',
  {
    providerApiKey: ProviderApiKey
    workspaceId: number
  }
>

export type UserInvitedEvent = LatitudeEventGeneric<
  'userInvited',
  {
    invited: User
    invitee: User
    userEmail: string
    workspaceId: number
  }
>

export type CommitPublishedDocumentChange = {
  path: string
  changeType: ModifiedDocumentType
}

export type CommitPublishedEvent = LatitudeEventGeneric<
  'commitPublished',
  {
    commit: Commit
    userEmail: string
    workspaceId: number
    changedDocuments: CommitPublishedDocumentChange[]
  }
>

export type CommitMergedEvent = LatitudeEventGeneric<
  'commitMerged',
  {
    commit: Commit
    userEmail: string
    workspaceId: number
  }
>

export type CommitDeletedEvent = LatitudeEventGeneric<
  'commitDeleted',
  {
    commit: Commit
    workspaceId: number
  }
>

export type DocumentCreatedEvent = LatitudeEventGeneric<
  'documentCreated',
  {
    document: DocumentVersion
    workspaceId: number
    userEmail?: string
  }
>

export type DocumentsDeletedEvent = LatitudeEventGeneric<
  'documentsDeleted',
  {
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuids: string[]
    softDeletedDocumentUuids: string[]
    hardDeletedDocumentUuids: string[]
  }
>

type CommonDataDocumentRunRequestedEvent = {
  projectId: number
  commitUuid: string
  isLiveCommit: boolean
  documentPath: string
  parameters: Record<string, unknown>
  workspaceId: number
}
export type DocumentRunRequestedEvent = LatitudeEventGeneric<
  'documentRunRequested',
  CommonDataDocumentRunRequestedEvent & {
    userEmail: string
    userMessage?: string
  }
>

export type ChatMessageRequestedEvent = LatitudeEventGeneric<
  'chatMessageRequested',
  {
    documentLogUuid: string
    messages: Message[]
    workspaceId: number
    userEmail: string
  }
>

export type CopilotSuggestionGenerated = LatitudeEventGeneric<
  'copilotSuggestionGenerated',
  {
    userEmail: string
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
  }
>
export type CopilotSuggestionApplied = LatitudeEventGeneric<
  'copilotSuggestionApplied',
  {
    userEmail: string
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
  }
>

export type EvaluationV2CreatedEvent = LatitudeEventGeneric<
  'evaluationV2Created',
  {
    workspaceId: number
    evaluation: EvaluationV2
  }
>

export type EvaluationV2UpdatedEvent = LatitudeEventGeneric<
  'evaluationV2Updated',
  {
    workspaceId: number
    evaluation: EvaluationV2
  }
>

export type EvaluationV2AlignmentUpdatedEvent = LatitudeEventGeneric<
  'evaluationV2AlignmentUpdated',
  {
    workspaceId: number
    evaluationUuid: string
    alignmentMetricMetadata: AlignmentMetricMetadata
  }
>

export type EvaluationV2DeletedEvent = LatitudeEventGeneric<
  'evaluationV2Deleted',
  {
    workspaceId: number
    evaluation: EvaluationV2
  }
>

export type EvaluationV2RanEvent = LatitudeEventGeneric<
  'evaluationV2Ran',
  {
    workspaceId: number
    evaluation: EvaluationV2
    result: EvaluationResultV2
    commit: Commit
    spanId: string
    traceId: string
  }
>

export type EvaluationV2AnnotatedEvent = LatitudeEventGeneric<
  'evaluationV2Annotated',
  {
    workspaceId: number
    isNew: boolean
    evaluation: EvaluationV2
    result: EvaluationResultV2
    commit: Commit
    spanId: string
    traceId: string
    userEmail?: string | null
  }
>

export type EvaluationResultV2CreatedEvent = LatitudeEventGeneric<
  'evaluationResultV2Created',
  {
    workspaceId: number
    result: EvaluationResultV2
    evaluation: EvaluationV2
    spanId: string
    traceId: string
    commit: Commit
    experiment?: Experiment
    dataset?: DatasetV2
    datasetRow?: DatasetRow
  }
>

export type EvaluationResultV2UpdatedEvent = LatitudeEventGeneric<
  'evaluationResultV2Updated',
  {
    workspaceId: number
    result: EvaluationResultV2
    previousHasPassed: boolean | null
    evaluation: EvaluationV2
  }
>

export type WebhookDeliveryCreatedEvent = LatitudeEventGeneric<
  'webhookDeliveryCreated',
  {
    webhookId: number
    eventType: Events
    status: 'success' | 'failed'
    responseStatus?: number
    responseBody?: string
    errorMessage?: string
    nextRetryAt?: Date
  }
>

export type ExportReadyEvent = LatitudeEventGeneric<
  'exportReady',
  {
    workspaceId: number
    userId: string
    uuid: string
  }
>

export type SpanCreatedEvent = LatitudeEventGeneric<
  'spanCreated',
  {
    workspaceId: number
    apiKeyId: number
    spanId: string
    traceId: string
    documentUuid: string | undefined
    spanType: SpanType
    isConversationRoot: boolean
    projectId?: number | null
  }
>

export type SegmentCreatedEvent = LatitudeEventGeneric<
  'segmentCreated',
  {
    workspaceId: number
    apiKeyId: number
    segmentId: string
  }
>

export type SegmentUpdatedEvent = LatitudeEventGeneric<
  'segmentUpdated',
  {
    workspaceId: number
    apiKeyId: number
    segmentId: string
  }
>

export type ActionExecutedEvent = LatitudeEventGeneric<
  'actionExecuted',
  {
    workspaceId: number
    userEmail: string
    actionType: string
  }
>

export type ToolExecutedEvent = LatitudeEventGeneric<
  'toolExecuted',
  {
    workspaceId: number
    userEmail?: string
    type: 'integration' | 'latitude' | 'client'
    integration?: {
      id: number
      name: string
      type: string
    }
    latitudeTool?: string
    toolName: string
  }
>

export type DocumentTriggerUndeployRequestedEvent = LatitudeEventGeneric<
  'documentTriggerUndeployRequested',
  {
    workspaceId: number
    triggerId: string
    externalUserId: string
  }
>
export type DocumentTriggerCreatedEvent = LatitudeEventGeneric<
  'documentTriggerCreated',
  {
    workspaceId: number
    documentTrigger: DocumentTrigger
    project: Project
    commit: Commit
  }
>

export type DocumentTriggerEventCreatedEvent = LatitudeEventGeneric<
  'documentTriggerEventCreated',
  {
    workspaceId: number
    documentTriggerEvent: DocumentTriggerEvent
    commit: Commit
  }
>

export type DocumentTriggerDeletedEvent = LatitudeEventGeneric<
  'documentTriggerDeleted',
  {
    workspaceId: number
    documentTrigger: DocumentTrigger
    projectId: number
    commit: Commit
  }
>

export type SubscriptionUpdatedEvent = LatitudeEventGeneric<
  'subscriptionUpdated',
  {
    workspace: Workspace
    subscription: Subscription
    userEmail: string
  }
>

export type WorkspaceFinishingFreeTrialEvent = LatitudeEventGeneric<
  'workspaceFinishingFreeTrial',
  {
    userEmail: string
    userGoal: string | null
  }
>

export type SubscriptionEnqueuedForCancellationEvent = LatitudeEventGeneric<
  'subscriptionEnqueuedForCancellation',
  {
    workspaceId: number
    subscriptionId: number
    cancellationDate: string
    userEmail: string
  }
>

export type StripeCustomerIdAssignedEvent = LatitudeEventGeneric<
  'stripeCustomerIdAssigned',
  {
    workspaceId: number
    stripeCustomerId: string
    userEmail: string
    origin: 'webhook' | 'backoffice'
  }
>

export type StripeCustomerIdUnassignedEvent = LatitudeEventGeneric<
  'stripeCustomerIdUnassigned',
  {
    workspaceId: number
    userEmail: string
  }
>

type DocumentRunMetrics = {
  runUsage: {
    inputTokens: number
    outputTokens: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    reasoningTokens: number
    cachedInputTokens: number
  }
  runCost: CostBreakdown
  duration: number
}

type DocumentRunStatusEventData = {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  run: ActiveRun
  eventContext: 'foreground' | 'background'
  activeDeploymentTest?: DeploymentTest
  parameters?: Record<string, unknown>
  customIdentifier?: string | null
  tools?: string[]
  userMessage?: string
  metrics?: DocumentRunMetrics
  experimentId?: number
}

export type DocumentRunQueuedEvent = LatitudeEventGeneric<
  'documentRunQueued',
  DocumentRunStatusEventData
>
export type DocumentRunStartedEvent = LatitudeEventGeneric<
  'documentRunStarted',
  DocumentRunStatusEventData
>
export type DocumentRunProgressEvent = LatitudeEventGeneric<
  'documentRunProgress',
  DocumentRunStatusEventData
>
export type DocumentRunEndedEvent = LatitudeEventGeneric<
  'documentRunEnded',
  DocumentRunStatusEventData
>

export type DocumentRunStatusEvent =
  | DocumentRunQueuedEvent
  | DocumentRunStartedEvent
  | DocumentRunProgressEvent
  | DocumentRunEndedEvent

type EvaluationStatusEventData = {
  workspaceId: number
  projectId: number
  evaluation: ActiveEvaluation
}

export type EvaluationQueuedEvent = LatitudeEventGeneric<
  'evaluationQueued',
  EvaluationStatusEventData
>
export type EvaluationStartedEvent = LatitudeEventGeneric<
  'evaluationStarted',
  EvaluationStatusEventData
>
export type EvaluationProgressEvent = LatitudeEventGeneric<
  'evaluationProgress',
  EvaluationStatusEventData
>
export type EvaluationEndedEvent = LatitudeEventGeneric<
  'evaluationEnded',
  EvaluationStatusEventData
>
export type EvaluationFailedEvent = LatitudeEventGeneric<
  'evaluationFailed',
  EvaluationStatusEventData & {
    error: Error
  }
>

export type EvaluationStatusEvent =
  | EvaluationQueuedEvent
  | EvaluationStartedEvent
  | EvaluationProgressEvent
  | EvaluationEndedEvent
  | EvaluationFailedEvent

export type CommitUpdatedEvent = LatitudeEventGeneric<
  'commitUpdated',
  {
    workspaceId: number
    commit: Commit
  }
>

export type PasteYourPromptOnboardingPageVisited = LatitudeEventGeneric<
  'pasteYourPromptOnboardingPageVisited',
  {
    workspaceId: number
    userEmail: string
  }
>

export type GenerateDatasetOnboardingPageVisited = LatitudeEventGeneric<
  'generateDatasetOnboardingPageVisited',
  {
    workspaceId: number
    userEmail: string
  }
>

export type RunExperimentOnboardingPageVisited = LatitudeEventGeneric<
  'runExperimentOnboardingPageVisited',
  {
    workspaceId: number
    userEmail: string
  }
>

export type PasteYourPromptOnboardingCompleted = LatitudeEventGeneric<
  'pasteYourPromptOnboardingCompleted',
  {
    workspaceId: number
    userEmail: string
  }
>

export type IssueCreatedEvent = LatitudeEventGeneric<
  'issueCreated',
  {
    workspaceId: number
    issueId: number
  }
>

export type IssueUpdatedEvent = LatitudeEventGeneric<
  'issueUpdated',
  {
    workspaceId: number
    issueId: number
  }
>

export type IssueDeletedEvent = LatitudeEventGeneric<
  'issueDeleted',
  {
    workspaceId: number
    issueId: number
  }
>

export type IssueIncrementedEvent = LatitudeEventGeneric<
  'issueIncremented',
  {
    workspaceId: number
    issueId: number
    histogramId: number
    commitUuid: string
    projectId: number
  }
>

export type IssueDecrementedEvent = LatitudeEventGeneric<
  'issueDecremented',
  {
    workspaceId: number
    issueId: number
    histogramId: number
  }
>

export type IssueDiscoveredEvent = LatitudeEventGeneric<
  'issueDiscovered',
  {
    workspaceId: number
    issueId: number
  }
>

export type IssueMergedEvent = LatitudeEventGeneric<
  'issueMerged',
  {
    workspaceId: number
    anchorId: number
    mergedIds: number[]
  }
>

export type IssueResolvedEvent = LatitudeEventGeneric<
  'issueResolved',
  {
    workspaceId: number
    issueId: number
    userEmail: string
  }
>

export type IssueUnresolvedEvent = LatitudeEventGeneric<
  'issueUnresolved',
  {
    workspaceId: number
    issueId: number
    userEmail: string
  }
>

export type IssueIgnoredEvent = LatitudeEventGeneric<
  'issueIgnored',
  {
    workspaceId: number
    issueId: number
    userEmail: string
  }
>

export type IssueUnignoredEvent = LatitudeEventGeneric<
  'issueUnignored',
  {
    workspaceId: number
    issueId: number
    userEmail: string
  }
>

export type WeeklyEmailPreferenceUpdatedEvent = LatitudeEventGeneric<
  'weeklyEmailPreferenceUpdated',
  {
    workspaceId: number
    userId: string
    userEmail: string
    wantToReceive: boolean
  }
>

export type EscalatingIssuesEmailPreferenceUpdatedEvent = LatitudeEventGeneric<
  'escalatingIssuesEmailPreferenceUpdated',
  {
    workspaceId: number
    userId: string
    userEmail: string
    wantToReceive: boolean
  }
>

export type WorkspaceIssuesDashboardUnlockedEvent = LatitudeEventGeneric<
  'workspaceIssuesDashboardUnlocked',
  {
    workspaceId: number
    projectId: number
    userEmail: string | null
  }
>

export type DeploymentTestCreatedEvent = LatitudeEventGeneric<
  'deploymentTestCreated',
  {
    deploymentTestId: number
    workspaceId: number
    userEmail: string | null
  }
>

export type WeeklyWorkspacesNotifiedTotalEvent = LatitudeEventGeneric<
  'weeklyWorkspacesNotifiedTotal',
  {
    userEmail: string
    numberOfWorkspaces: number
  }
>

export type WeeklyWorkspaceNotifiedEvent = LatitudeEventGeneric<
  'weeklyWorkspaceNotified',
  {
    userEmail: string
    workspaceId: number
    numberOfEmails: number
    logs: {
      logsCount: number
      tokensSpent: number
      tokensCost: number
      usedInProduction: boolean
    }
    issues: {
      hasIssues: boolean
      issuesCount: number
      newIssuesCount: number
      escalatedIssuesCount: number
      resolvedIssuesCount: number
      ignoredIssuesCount: number
      regressedIssuesCount: number
    }
    annotations: {
      hasAnnotations: boolean
      annotationsCount: number
      passedCount: number
      failedCount: number
    }
  }
>

export type OptimizationStartedEvent = LatitudeEventGeneric<
  'optimizationStarted',
  {
    workspaceId: number
    optimizationId: number
  }
>

export type OptimizationPreparedEvent = LatitudeEventGeneric<
  'optimizationPrepared',
  {
    workspaceId: number
    optimizationId: number
  }
>

export type OptimizationExecutedEvent = LatitudeEventGeneric<
  'optimizationExecuted',
  {
    workspaceId: number
    optimizationId: number
  }
>

export type OptimizationValidatedEvent = LatitudeEventGeneric<
  'optimizationValidated',
  {
    workspaceId: number
    optimizationId: number
  }
>

export type OptimizationEndedEvent = LatitudeEventGeneric<
  'optimizationEnded',
  {
    workspaceId: number
    optimizationId: number
  }
>

export type OptimizationStatusEvent =
  | OptimizationStartedEvent
  | OptimizationPreparedEvent
  | OptimizationExecutedEvent
  | OptimizationValidatedEvent
  | OptimizationEndedEvent

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | UserOnboardingInfoUpdatedEvent
  | MagicLinkTokenCreated
  | ExperimentVariantsCreatedEvent
  | WorkspaceCreatedEvent
  | WorkspaceFinishingFreeTrialEvent
  | ProjectCreatedEvent
  | SendReferralInvitationEvent
  | ClaimReferralInvitationEvent
  | DatasetCreatedEvent
  | DatasetV2CreatedEvent
  | ProviderApiKeyCreatedEvent
  | ProviderApiKeyDestroyedEvent
  | ProviderApiKeyUpdatedEvent
  | UserInvitedEvent
  | CommitCreatedEvent
  | CommitPublishedEvent
  | CommitMergedEvent
  | CommitDeletedEvent
  | DocumentCreatedEvent
  | DocumentsDeletedEvent
  | DocumentRunRequestedEvent
  | ChatMessageRequestedEvent
  | CopilotSuggestionGenerated
  | CopilotSuggestionApplied
  | EvaluationV2CreatedEvent
  | EvaluationV2UpdatedEvent
  | EvaluationV2AlignmentUpdatedEvent
  | EvaluationV2DeletedEvent
  | EvaluationV2RanEvent
  | EvaluationV2AnnotatedEvent
  | EvaluationResultV2CreatedEvent
  | EvaluationResultV2UpdatedEvent
  | WebhookDeliveryCreatedEvent
  | ExportReadyEvent
  | SpanCreatedEvent
  | SegmentCreatedEvent
  | SegmentUpdatedEvent
  | ActionExecutedEvent
  | ToolExecutedEvent
  | DocumentTriggerUndeployRequestedEvent
  | DocumentTriggerCreatedEvent
  | DocumentTriggerDeletedEvent
  | DocumentTriggerEventCreatedEvent
  | PromocodeClaimedEvent
  | SubscriptionUpdatedEvent
  | SubscriptionEnqueuedForCancellationEvent
  | StripeCustomerIdAssignedEvent
  | StripeCustomerIdUnassignedEvent
  | DocumentRunQueuedEvent
  | DocumentRunStartedEvent
  | DocumentRunProgressEvent
  | DocumentRunEndedEvent
  | CommitUpdatedEvent
  | PasteYourPromptOnboardingPageVisited
  | GenerateDatasetOnboardingPageVisited
  | RunExperimentOnboardingPageVisited
  | PasteYourPromptOnboardingCompleted
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | IssueDeletedEvent
  | IssueIncrementedEvent
  | IssueDecrementedEvent
  | IssueDiscoveredEvent
  | IssueMergedEvent
  | IssueResolvedEvent
  | IssueUnresolvedEvent
  | IssueIgnoredEvent
  | IssueUnignoredEvent
  | EvaluationQueuedEvent
  | EvaluationStartedEvent
  | EvaluationProgressEvent
  | EvaluationEndedEvent
  | EvaluationFailedEvent
  | WeeklyEmailPreferenceUpdatedEvent
  | EscalatingIssuesEmailPreferenceUpdatedEvent
  | WorkspaceIssuesDashboardUnlockedEvent
  | DeploymentTestCreatedEvent
  | WeeklyWorkspacesNotifiedTotalEvent
  | WeeklyWorkspaceNotifiedEvent
  | OptimizationStartedEvent
  | OptimizationPreparedEvent
  | OptimizationExecutedEvent
  | OptimizationValidatedEvent
  | OptimizationEndedEvent

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  userOnboardingInfoUpdated: EventHandler<UserOnboardingInfoUpdatedEvent>[]
  experimentVariantsCreated: EventHandler<ExperimentVariantsCreatedEvent>[]
  workspaceCreated: EventHandler<WorkspaceCreatedEvent>[]
  workspaceFinishingFreeTrial: EventHandler<WorkspaceFinishingFreeTrialEvent>[]
  projectCreated: EventHandler<ProjectCreatedEvent>[]
  sendReferralInvitation: EventHandler<SendReferralInvitationEvent>[]
  claimReferralInvitations: EventHandler<ClaimReferralInvitationEvent>[]
  datasetCreated: EventHandler<DatasetCreatedEvent>[]
  datasetUploaded: EventHandler<DatasetV2CreatedEvent>[]
  providerApiKeyCreated: EventHandler<ProviderApiKeyCreatedEvent>[]
  providerApiKeyDestroyed: EventHandler<ProviderApiKeyDestroyedEvent>[]
  providerApiKeyUpdated: EventHandler<ProviderApiKeyUpdatedEvent>[]
  userInvited: EventHandler<UserInvitedEvent>[]
  commitCreated: EventHandler<CommitCreatedEvent>[]
  commitPublished: EventHandler<CommitPublishedEvent>[]
  commitMerged: EventHandler<CommitMergedEvent>[]
  commitDeleted: EventHandler<CommitDeletedEvent>[]
  documentCreated: EventHandler<DocumentCreatedEvent>[]
  documentsDeleted: EventHandler<DocumentsDeletedEvent>[]
  documentRunRequested: EventHandler<DocumentRunRequestedEvent>[]
  chatMessageRequested: EventHandler<ChatMessageRequestedEvent>[]
  copilotSuggestionGenerated: EventHandler<CopilotSuggestionGenerated>[]
  copilotSuggestionApplied: EventHandler<CopilotSuggestionApplied>[]
  evaluationV2Created: EventHandler<EvaluationV2CreatedEvent>[]
  evaluationV2Updated: EventHandler<EvaluationV2UpdatedEvent>[]
  evaluationV2AlignmentUpdated: EventHandler<EvaluationV2AlignmentUpdatedEvent>[]
  evaluationV2Deleted: EventHandler<EvaluationV2DeletedEvent>[]
  evaluationV2Ran: EventHandler<EvaluationV2RanEvent>[]
  evaluationV2Annotated: EventHandler<EvaluationV2AnnotatedEvent>[]
  evaluationResultV2Created: EventHandler<EvaluationResultV2CreatedEvent>[]
  evaluationResultV2Updated: EventHandler<EvaluationResultV2UpdatedEvent>[]
  webhookDeliveryCreated: EventHandler<WebhookDeliveryCreatedEvent>[]
  exportReady: EventHandler<ExportReadyEvent>[]
  spanCreated: EventHandler<SpanCreatedEvent>[]
  segmentCreated: EventHandler<SegmentCreatedEvent>[]
  segmentUpdated: EventHandler<SegmentUpdatedEvent>[]
  actionExecuted: EventHandler<ActionExecutedEvent>[]
  toolExecuted: EventHandler<ToolExecutedEvent>[]
  documentTriggerUndeployRequested: EventHandler<DocumentTriggerUndeployRequestedEvent>[]
  documentTriggerCreated: EventHandler<DocumentTriggerCreatedEvent>[]
  documentTriggerDeleted: EventHandler<DocumentTriggerDeletedEvent>[]
  documentTriggerEventCreated: EventHandler<DocumentTriggerEventCreatedEvent>[]
  promocodeClaimed: EventHandler<PromocodeClaimedEvent>[]
  subscriptionUpdated: EventHandler<SubscriptionUpdatedEvent>[]
  subscriptionEnqueuedForCancellation: EventHandler<SubscriptionEnqueuedForCancellationEvent>[]
  stripeCustomerIdAssigned: EventHandler<StripeCustomerIdAssignedEvent>[]
  stripeCustomerIdUnassigned: EventHandler<StripeCustomerIdUnassignedEvent>[]
  documentRunQueued: EventHandler<DocumentRunQueuedEvent>[]
  documentRunStarted: EventHandler<DocumentRunStartedEvent>[]
  documentRunProgress: EventHandler<DocumentRunProgressEvent>[]
  documentRunEnded: EventHandler<DocumentRunEndedEvent>[]
  commitUpdated: EventHandler<CommitUpdatedEvent>[]
  pasteYourPromptOnboardingPageVisited: EventHandler<PasteYourPromptOnboardingPageVisited>[]
  generateDatasetOnboardingPageVisited: EventHandler<GenerateDatasetOnboardingPageVisited>[]
  runExperimentOnboardingPageVisited: EventHandler<RunExperimentOnboardingPageVisited>[]
  pasteYourPromptOnboardingCompleted: EventHandler<PasteYourPromptOnboardingCompleted>[]
  issueCreated: EventHandler<IssueCreatedEvent>[]
  issueUpdated: EventHandler<IssueUpdatedEvent>[]
  issueDeleted: EventHandler<IssueDeletedEvent>[]
  issueIncremented: EventHandler<IssueIncrementedEvent>[]
  issueDecremented: EventHandler<IssueDecrementedEvent>[]
  issueDiscovered: EventHandler<IssueDiscoveredEvent>[]
  issueMerged: EventHandler<IssueMergedEvent>[]
  issueResolved: EventHandler<IssueResolvedEvent>[]
  issueUnresolved: EventHandler<IssueUnresolvedEvent>[]
  issueIgnored: EventHandler<IssueIgnoredEvent>[]
  issueUnignored: EventHandler<IssueUnignoredEvent>[]
  evaluationQueued: EventHandler<EvaluationQueuedEvent>[]
  evaluationStarted: EventHandler<EvaluationStartedEvent>[]
  evaluationProgress: EventHandler<EvaluationProgressEvent>[]
  evaluationFailed: EventHandler<EvaluationFailedEvent>[]
  evaluationEnded: EventHandler<EvaluationEndedEvent>[]
  weeklyEmailPreferenceUpdated: EventHandler<WeeklyEmailPreferenceUpdatedEvent>[]
  escalatingIssuesEmailPreferenceUpdated: EventHandler<EscalatingIssuesEmailPreferenceUpdatedEvent>[]
  workspaceIssuesDashboardUnlocked: EventHandler<WorkspaceIssuesDashboardUnlockedEvent>[]
  deploymentTestCreated: EventHandler<DeploymentTestCreatedEvent>[]
  weeklyWorkspacesNotifiedTotal: EventHandler<WeeklyWorkspacesNotifiedTotalEvent>[]
  weeklyWorkspaceNotified: EventHandler<WeeklyWorkspaceNotifiedEvent>[]
  optimizationStarted: EventHandler<OptimizationStartedEvent>[]
  optimizationPrepared: EventHandler<OptimizationPreparedEvent>[]
  optimizationExecuted: EventHandler<OptimizationExecutedEvent>[]
  optimizationValidated: EventHandler<OptimizationValidatedEvent>[]
  optimizationEnded: EventHandler<OptimizationEndedEvent>[]
}
