import { ExperimentVariant } from '@latitude-data/constants/experiments'
import { type Commit } from '../schema/models/types/Commit'
import { type Dataset } from '../schema/models/types/Dataset'
import { type DatasetRow } from '../schema/models/types/DatasetRow'
import { type DocumentSuggestion } from '../schema/models/types/DocumentSuggestion'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Experiment } from '../schema/models/types/Experiment'
import { type MagicLinkToken } from '../schema/models/types/MagicLinkTokens'
import { type Membership } from '../schema/models/types/Membership'
import { type Project } from '../schema/models/types/Project'
import { type ProviderApiKey } from '../schema/models/types/ProviderApiKey'
import { type ProviderLog } from '../schema/models/types/ProviderLog'
import { type User } from '../schema/models/types/User'
import { type Workspace } from '../schema/models/types/Workspace'
import {
  DatasetV2,
  DocumentLog,
  EvaluationResultV2,
  EvaluationV2,
  Message,
} from '../schema/types'

export type Events =
  | 'magicLinkTokenCreated'
  | 'userCreated'
  | 'membershipCreated'
  | 'experimentVariantsCreated'
  | 'providerLogCreated'
  | 'workspaceCreated'
  | 'projectCreated'
  | 'documentLogCreated'
  | 'documentSuggestionCreated'
  | 'documentSuggestionApplied'
  | 'documentSuggestionDiscarded'
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
  | 'documentCreated'
  | 'documentRunRequested'
  | 'publicDocumentRunRequested'
  | 'chatMessageRequested'
  | 'sharedChatMessageRequested'
  | 'forkDocumentRequested'
  | 'copilotRefinerGenerated'
  | 'copilotRefinerApplied'
  | 'copilotSuggestionGenerated'
  | 'copilotSuggestionApplied'
  | 'evaluationV2Created'
  | 'evaluationV2Updated'
  | 'evaluationV2Deleted'
  | 'evaluationV2Ran'
  | 'evaluationV2Annotated'
  | 'evaluationResultV2Created'
  | 'evaluationResultV2Updated'
  | 'mcpServerConnected'
  | 'scaleMcpServer'
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
  | 'runQueued'
  | 'runStarted'
  | 'runProgress'
  | 'runEnded'
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

export type ProviderLogCreatedEvent = LatitudeEventGeneric<
  'providerLogCreated',
  Pick<ProviderLog, 'id'> & { workspaceId: number }
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

export type DocumentLogCreatedEvent = LatitudeEventGeneric<
  'documentLogCreated',
  Pick<DocumentLog, 'id'> & { workspaceId: number }
>

export type DocumentSuggestionCreatedEvent = LatitudeEventGeneric<
  'documentSuggestionCreated',
  {
    workspaceId: number
    suggestion: DocumentSuggestion
    evaluation: EvaluationV2
  }
>

export type DocumentSuggestionAppliedEvent = LatitudeEventGeneric<
  'documentSuggestionApplied',
  {
    workspaceId: number
    userId: string
    suggestion: DocumentSuggestion
  }
>

export type DocumentSuggestionDiscardedEvent = LatitudeEventGeneric<
  'documentSuggestionDiscarded',
  {
    workspaceId: number
    userId: string
    suggestion: DocumentSuggestion
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

export type CommitPublishedEvent = LatitudeEventGeneric<
  'commitPublished',
  {
    commit: Commit
    userEmail: string
    workspaceId: number
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

export type DocumentCreatedEvent = LatitudeEventGeneric<
  'documentCreated',
  {
    document: DocumentVersion
    workspaceId: number
    userEmail?: string
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
export type PublicDocumentRunRequestedEvent = LatitudeEventGeneric<
  'publicDocumentRunRequested',
  CommonDataDocumentRunRequestedEvent & {
    publishedDocumentUuid: string
  }
>

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

export type SharedChatMessageRequestedEvent = LatitudeEventGeneric<
  'sharedChatMessageRequested',
  {
    publishedDocumentUuid: string
    documentLogUuid: string
    messages: Message[]
    workspaceId: number
  }
>

export type ForkDocumentRequestedEvent = LatitudeEventGeneric<
  'forkDocumentRequested',
  {
    origin: {
      workspaceId: number
      commitUuid: string
      documentUuid: string
    }
    destination: {
      workspaceId: number
      userEmail: string
    }
  }
>

export type CopilotRefinerGenerated = LatitudeEventGeneric<
  'copilotRefinerGenerated',
  {
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
    userEmail: string
  } & {
    evaluationUuid: string
  }
>
export type CopilotRefinerApplied = LatitudeEventGeneric<
  'copilotRefinerApplied',
  {
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
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
  }
>

export type ScaleMcpServerEvent = LatitudeEventGeneric<
  'scaleMcpServer',
  {
    workspaceId: number
    mcpServerId: number
    replicas: number
  }
>

export type McpServerConnectedEvent = LatitudeEventGeneric<
  'mcpServerConnected',
  {
    workspaceId: number
    mcpServerId: number
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

export type RunQueuedEvent = LatitudeEventGeneric<
  'runQueued',
  {
    workspaceId: number
    projectId: number
    runUuid: string
  }
>

export type RunStartedEvent = LatitudeEventGeneric<
  'runStarted',
  {
    workspaceId: number
    projectId: number
    runUuid: string
  }
>

export type RunProgressEvent = LatitudeEventGeneric<
  'runProgress',
  {
    workspaceId: number
    projectId: number
    runUuid: string
  }
>

export type RunStatusEvent =
  | RunQueuedEvent
  | RunStartedEvent
  | RunProgressEvent
  | RunEndedEvent

export type RunEndedEvent = LatitudeEventGeneric<
  'runEnded',
  {
    workspaceId: number
    projectId: number
    runUuid: string
  }
>

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

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | MagicLinkTokenCreated
  | ProviderLogCreatedEvent
  | ExperimentVariantsCreatedEvent
  | WorkspaceCreatedEvent
  | ProjectCreatedEvent
  | DocumentLogCreatedEvent
  | DocumentSuggestionCreatedEvent
  | DocumentSuggestionAppliedEvent
  | DocumentSuggestionDiscardedEvent
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
  | DocumentCreatedEvent
  | DocumentRunRequestedEvent
  | PublicDocumentRunRequestedEvent
  | ChatMessageRequestedEvent
  | SharedChatMessageRequestedEvent
  | ForkDocumentRequestedEvent
  | CopilotRefinerGenerated
  | CopilotRefinerApplied
  | CopilotSuggestionGenerated
  | CopilotSuggestionApplied
  | EvaluationV2CreatedEvent
  | EvaluationV2UpdatedEvent
  | EvaluationV2DeletedEvent
  | EvaluationV2RanEvent
  | EvaluationV2AnnotatedEvent
  | EvaluationResultV2CreatedEvent
  | EvaluationResultV2UpdatedEvent
  | ScaleMcpServerEvent
  | McpServerConnectedEvent
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
  | RunQueuedEvent
  | RunStartedEvent
  | RunProgressEvent
  | RunEndedEvent
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

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  providerLogCreated: EventHandler<ProviderLogCreatedEvent>[]
  experimentVariantsCreated: EventHandler<ExperimentVariantsCreatedEvent>[]
  workspaceCreated: EventHandler<WorkspaceCreatedEvent>[]
  projectCreated: EventHandler<ProjectCreatedEvent>[]
  documentLogCreated: EventHandler<DocumentLogCreatedEvent>[]
  documentSuggestionCreated: EventHandler<DocumentSuggestionCreatedEvent>[]
  documentSuggestionApplied: EventHandler<DocumentSuggestionAppliedEvent>[]
  documentSuggestionDiscarded: EventHandler<DocumentSuggestionDiscardedEvent>[]
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
  documentCreated: EventHandler<DocumentCreatedEvent>[]
  documentRunRequested: EventHandler<DocumentRunRequestedEvent>[]
  publicDocumentRunRequested: EventHandler<PublicDocumentRunRequestedEvent>[]
  chatMessageRequested: EventHandler<ChatMessageRequestedEvent>[]
  sharedChatMessageRequested: EventHandler<SharedChatMessageRequestedEvent>[]
  forkDocumentRequested: EventHandler<ForkDocumentRequestedEvent>[]
  copilotRefinerGenerated: EventHandler<CopilotRefinerGenerated>[]
  copilotRefinerApplied: EventHandler<CopilotRefinerApplied>[]
  copilotSuggestionGenerated: EventHandler<CopilotSuggestionGenerated>[]
  copilotSuggestionApplied: EventHandler<CopilotSuggestionApplied>[]
  evaluationV2Created: EventHandler<EvaluationV2CreatedEvent>[]
  evaluationV2Updated: EventHandler<EvaluationV2UpdatedEvent>[]
  evaluationV2Deleted: EventHandler<EvaluationV2DeletedEvent>[]
  evaluationV2Ran: EventHandler<EvaluationV2RanEvent>[]
  evaluationV2Annotated: EventHandler<EvaluationV2AnnotatedEvent>[]
  evaluationResultV2Created: EventHandler<EvaluationResultV2CreatedEvent>[]
  evaluationResultV2Updated: EventHandler<EvaluationResultV2UpdatedEvent>[]
  scaleMcpServer: EventHandler<ScaleMcpServerEvent>[]
  mcpServerConnected: EventHandler<McpServerConnectedEvent>[]
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
  runQueued: EventHandler<RunQueuedEvent>[]
  runStarted: EventHandler<RunStartedEvent>[]
  runProgress: EventHandler<RunProgressEvent>[]
  runEnded: EventHandler<RunEndedEvent>[]
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
}
