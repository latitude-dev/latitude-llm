import { FinishReason, LanguageModelUsage } from 'ai'

import type {
  ChainStepResponse,
  Commit,
  Dataset,
  DocumentLog,
  DocumentVersion,
  Evaluation,
  EvaluationResult,
  EvaluationResultDto,
  LogSources,
  MagicLinkToken,
  Membership,
  Message,
  Project,
  ProviderApiKey,
  ProviderLog,
  Providers,
  Span,
  StreamType,
  Trace,
  User,
  Workspace,
} from '../browser'
import { PartialConfig } from '../services/ai'

export type Events =
  | 'magicLinkTokenCreated'
  | 'userCreated'
  | 'membershipCreated'
  | 'evaluationRun'
  | 'documentRun'
  | 'providerLogCreated'
  | 'aiProviderCallCompleted'
  | 'workspaceCreated'
  | 'projectCreated'
  | 'documentLogCreated'
  | 'sendReferralInvitation'
  | 'claimReferralInvitations'
  | 'evaluationCreated'
  | 'datasetCreated'
  | 'providerApiKeyCreated'
  | 'userInvited'
  | 'commitCreated'
  | 'commitPublished'
  | 'evaluationsConnected'
  | 'batchEvaluationRun'
  | 'documentCreated'
  | 'evaluationResultCreated'
  | 'documentRunRequested'
  | 'publicDocumentRunRequested'
  | 'chatMessageRequested'
  | 'sharedChatMessageRequested'
  | 'forkDocumentRequested'
  | 'batchEvaluationRunRequested'
  | 'runDocumentInBatchRequested'
  | 'copilotRefinerGenerated'
  | 'copilotRefinerApplied'
  | 'copilotSuggestionGenerated'
  | 'copilotSuggestionApplied'
  | 'evaluationResultUpdated'
  | 'bulkCreateTracesAndSpans'

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
export type EvaluationRunEvent = LatitudeEventGeneric<
  'evaluationRun',
  {
    documentUuid: string
    evaluationId: number
    documentLogUuid: string
    workspaceId: number
    providerLogUuid: string | undefined
    response: ChainStepResponse<StreamType> | undefined
  }
>
export type DocumentRunEvent = LatitudeEventGeneric<
  'documentRun',
  {
    workspaceId: number
    documentUuid: string
    commitUuid: string
    projectId: number
    documentLogUuid: string
    resolvedContent: string
    parameters: Record<string, unknown>
    source: LogSources
    customIdentifier?: string
    duration?: number
    response?: ChainStepResponse<StreamType>
  }
>

export type ProviderLogCreatedEvent = LatitudeEventGeneric<
  'providerLogCreated',
  ProviderLog
>

export type StreamCommonData = {
  workspaceId: number
  uuid: string
  source: LogSources
  generatedAt: Date
  documentLogUuid?: string
  providerId: number
  providerType: Providers
  model: string
  config: PartialConfig
  messages: Message[]
  usage: LanguageModelUsage
  duration: number
  chainCompleted: boolean
  finishReason: FinishReason
}

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
export type AIProviderCallCompletedData<T extends StreamType> = T extends 'text'
  ? StreamCommonData & StreamTextData & { streamType: 'text' }
  : T extends 'object'
    ? StreamCommonData & StreamObjectData & { streamType: 'object' }
    : never

export type AIProviderCallCompletedEvent = LatitudeEventGeneric<
  'aiProviderCallCompleted',
  AIProviderCallCompletedData<StreamType>
>

export type WorkspaceCreatedEvent = LatitudeEventGeneric<
  'workspaceCreated',
  {
    workspace: Workspace
    user: User
    userEmail: string
    workspaceId: number
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
  DocumentLog
>

export type SendReferralInvitationEvent = LatitudeEventGeneric<
  'sendReferralInvitation',
  {
    email: string
    workspaceId: number
    userId: string
  }
>

export type ClaimReferralInvitationEvent = LatitudeEventGeneric<
  'claimReferralInvitations',
  {
    newUser: User
  }
>

export type EvaluationCreatedEvent = LatitudeEventGeneric<
  'evaluationCreated',
  {
    evaluation: Evaluation
    userEmail: string
    workspaceId: number
    projectId?: number
    documentUuid?: string
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

export type ProviderApiKeyCreatedEvent = LatitudeEventGeneric<
  'providerApiKeyCreated',
  {
    providerApiKey: ProviderApiKey
    userEmail: string
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

export type EvaluationsConnectedEvent = LatitudeEventGeneric<
  'evaluationsConnected',
  {
    evaluations: Partial<Evaluation>[] // it includes the basic stuff
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

export type BatchEvaluationRunEvent = LatitudeEventGeneric<
  'batchEvaluationRun',
  {
    evaluationId: number
    workspaceId: number
    userEmail: string
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

export type EvaluationResultCreatedEvent = LatitudeEventGeneric<
  'evaluationResultCreated',
  {
    evaluationResult: EvaluationResult
    evaluation: Evaluation
    documentLog: DocumentLog
    workspaceId: number
  }
>

type CommonDataDocumentRunRequestedEvent = {
  projectId: number
  commitUuid: string
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

export type BatchEvaluationRunRequestedEvent = LatitudeEventGeneric<
  'batchEvaluationRunRequested',
  {
    evaluationIds: number[]
    documentUuid: string
    workspaceId: number
    userEmail: string
  }
>

export type RunDocumentInBatchRequestedEvent = LatitudeEventGeneric<
  'runDocumentInBatchRequested',
  {
    document: DocumentVersion
    workspaceId: number
    userEmail: string
  }
>

export type CopilotRefinerGenerated = LatitudeEventGeneric<
  'copilotRefinerGenerated',
  {
    userEmail: string
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
    evaluationId: number
  }
>
export type CopilotRefinerApplied = LatitudeEventGeneric<
  'copilotRefinerApplied',
  {
    userEmail: string
    workspaceId: number
    projectId: number
    commitUuid: string
    documentUuid: string
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

export type EvaluationResultUpdatedEvent = LatitudeEventGeneric<
  'evaluationResultUpdated',
  {
    evaluationResult: EvaluationResultDto
    workspaceId: number
  }
>

export type BulkCreateTracesAndSpansEvent = LatitudeEventGeneric<
  'bulkCreateTracesAndSpans',
  {
    workspaceId: number
    traces: Trace[]
    spans: Span[]
  }
>

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | MagicLinkTokenCreated
  | EvaluationRunEvent
  | DocumentRunEvent
  | ProviderLogCreatedEvent
  | AIProviderCallCompletedEvent
  | WorkspaceCreatedEvent
  | ProjectCreatedEvent
  | DocumentLogCreatedEvent
  | SendReferralInvitationEvent
  | ClaimReferralInvitationEvent
  | EvaluationCreatedEvent
  | DatasetCreatedEvent
  | ProviderApiKeyCreatedEvent
  | UserInvitedEvent
  | CommitCreatedEvent
  | CommitPublishedEvent
  | EvaluationsConnectedEvent
  | BatchEvaluationRunEvent
  | DocumentCreatedEvent
  | EvaluationResultCreatedEvent
  | DocumentRunRequestedEvent
  | PublicDocumentRunRequestedEvent
  | ChatMessageRequestedEvent
  | SharedChatMessageRequestedEvent
  | ForkDocumentRequestedEvent
  | BatchEvaluationRunRequestedEvent
  | RunDocumentInBatchRequestedEvent
  | CopilotRefinerGenerated
  | CopilotRefinerApplied
  | CopilotSuggestionGenerated
  | CopilotSuggestionApplied
  | EvaluationResultUpdatedEvent
  | BulkCreateTracesAndSpansEvent

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  evaluationRun: EventHandler<EvaluationRunEvent>[]
  documentRun: EventHandler<DocumentRunEvent>[]
  providerLogCreated: EventHandler<ProviderLogCreatedEvent>[]
  aiProviderCallCompleted: EventHandler<AIProviderCallCompletedEvent>[]
  workspaceCreated: EventHandler<WorkspaceCreatedEvent>[]
  projectCreated: EventHandler<ProjectCreatedEvent>[]
  documentLogCreated: EventHandler<DocumentLogCreatedEvent>[]
  sendReferralInvitation: EventHandler<SendReferralInvitationEvent>[]
  claimReferralInvitations: EventHandler<ClaimReferralInvitationEvent>[]
  evaluationCreated: EventHandler<EvaluationCreatedEvent>[]
  datasetCreated: EventHandler<DatasetCreatedEvent>[]
  providerApiKeyCreated: EventHandler<ProviderApiKeyCreatedEvent>[]
  userInvited: EventHandler<UserInvitedEvent>[]
  commitCreated: EventHandler<CommitCreatedEvent>[]
  commitPublished: EventHandler<CommitPublishedEvent>[]
  evaluationsConnected: EventHandler<EvaluationsConnectedEvent>[]
  batchEvaluationRun: EventHandler<BatchEvaluationRunEvent>[]
  documentCreated: EventHandler<DocumentCreatedEvent>[]
  evaluationResultCreated: EventHandler<EvaluationResultCreatedEvent>[]
  documentRunRequested: EventHandler<DocumentRunRequestedEvent>[]
  publicDocumentRunRequested: EventHandler<PublicDocumentRunRequestedEvent>[]
  chatMessageRequested: EventHandler<ChatMessageRequestedEvent>[]
  sharedChatMessageRequested: EventHandler<SharedChatMessageRequestedEvent>[]
  forkDocumentRequested: EventHandler<ForkDocumentRequestedEvent>[]
  batchEvaluationRunRequested: EventHandler<BatchEvaluationRunRequestedEvent>[]
  runDocumentInBatchRequested: EventHandler<RunDocumentInBatchRequestedEvent>[]
  copilotRefinerGenerated: EventHandler<CopilotRefinerGenerated>[]
  copilotRefinerApplied: EventHandler<CopilotRefinerApplied>[]
  copilotSuggestionGenerated: EventHandler<CopilotSuggestionGenerated>[]
  copilotSuggestionApplied: EventHandler<CopilotSuggestionApplied>[]
  evaluationResultUpdated: EventHandler<EvaluationResultUpdatedEvent>[]
  bulkCreateTracesAndSpans: EventHandler<BulkCreateTracesAndSpansEvent>[]
}
