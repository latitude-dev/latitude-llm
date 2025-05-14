import { FinishReason, LanguageModelUsage } from 'ai'

import { ExperimentVariant } from '@latitude-data/constants/experiments'
import type {
  Commit,
  Dataset,
  DatasetRow,
  DatasetV2,
  DocumentLog,
  DocumentSuggestion,
  DocumentVersion,
  EvaluationResultV2,
  EvaluationV2,
  Experiment,
  LogSources,
  MagicLinkToken,
  Membership,
  Message,
  Project,
  ProviderApiKey,
  ProviderLog,
  ProviderLogDto,
  Providers,
  StreamType,
  User,
  Workspace,
} from '../browser'
import { PartialConfig } from '../services/ai'

export type Events =
  | 'magicLinkTokenCreated'
  | 'userCreated'
  | 'membershipCreated'
  | 'experimentVariantsCreated'
  | 'providerLogCreated'
  | 'aiProviderCallCompleted'
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
  | 'userInvited'
  | 'commitCreated'
  | 'commitPublished'
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
    workspaceId: number
    documentUuid: string
    commitUuid: string
    variants: ExperimentVariant[]
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
  DocumentLog & { workspaceId: number }
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
    providerLog: ProviderLogDto
  }
>

export type EvaluationV2AnnotatedEvent = LatitudeEventGeneric<
  'evaluationV2Annotated',
  {
    workspaceId: number
    evaluation: EvaluationV2
    result: EvaluationResultV2
    commit: Commit
    providerLog: ProviderLogDto
  }
>

export type EvaluationResultV2CreatedEvent = LatitudeEventGeneric<
  'evaluationResultV2Created',
  {
    workspaceId: number
    result: EvaluationResultV2
    evaluation: EvaluationV2
    commit: Commit
    providerLog: ProviderLogDto
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

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | MagicLinkTokenCreated
  | ProviderLogCreatedEvent
  | ExperimentVariantsCreatedEvent
  | AIProviderCallCompletedEvent
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
  | UserInvitedEvent
  | CommitCreatedEvent
  | CommitPublishedEvent
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

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  providerLogCreated: EventHandler<ProviderLogCreatedEvent>[]
  experimentVariantsCreated: EventHandler<ExperimentVariantsCreatedEvent>[]
  aiProviderCallCompleted: EventHandler<AIProviderCallCompletedEvent>[]
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
  userInvited: EventHandler<UserInvitedEvent>[]
  commitCreated: EventHandler<CommitCreatedEvent>[]
  commitPublished: EventHandler<CommitPublishedEvent>[]
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
}
