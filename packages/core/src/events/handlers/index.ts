import {
  ChainCallResponse,
  Commit,
  LogSources,
  MagicLinkToken,
  Membership,
  Message,
  Project,
  ProviderLog,
  User,
  Workspace,
} from '../../browser'
import { PartialConfig } from '../../services/ai'
import { createEvaluationResultJob } from './createEvaluationResultJob'
import { createDocumentLogJob } from './documentLogs/createJob'
import { sendInvitationToUserJob } from './sendInvitationToUser'
import { sendMagicLinkJob } from './sendMagicLinkHandler'

type LatitudeEventGeneric<
  U extends keyof typeof EventHandlers,
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
  MagicLinkToken
>
export type UserCreatedEvent = LatitudeEventGeneric<'userCreated', User>
export type MembershipCreatedEvent = LatitudeEventGeneric<
  'membershipCreated',
  Membership & { authorId?: string }
>
export type EvaluationRunEvent = LatitudeEventGeneric<
  'evaluationRun',
  {
    evaluationId: number
    documentLogUuid: string
    providerLogUuid: string
    response: ChainCallResponse
  }
>
export type DocumentRunEvent = LatitudeEventGeneric<
  'documentRun',
  {
    workspaceId: number
    documentUuid: string
    commitUuid: string
    projectId: number
    customIdentifier?: string
    duration: number
    documentLogUuid: string
    response: ChainCallResponse
    resolvedContent: string
    parameters: Record<string, unknown>
  }
>

export type ProviderLogCreatedEvent = LatitudeEventGeneric<
  'providerLogCreated',
  ProviderLog
>

export type AIProviderCallCompletedEvent = LatitudeEventGeneric<
  'aiProviderCallCompleted',
  {
    workspaceId: number
    uuid: string
    source: LogSources
    generatedAt: Date
    documentLogUuid?: string
    providerId: number
    providerType: string
    model: string
    config: PartialConfig
    messages: Message[]
    toolCalls: {
      id: string
      name: string
      arguments: unknown[]
    }[]
    usage: unknown
    duration: number
    responseText: string
    responseObject?: unknown
  }
>

export type WorkspaceCreatedEvent = LatitudeEventGeneric<
  'workspaceCreated',
  {
    workspace: Workspace
    user: User
  }
>

export type ProjectCreated = LatitudeEventGeneric<
  'projectCreated',
  {
    project: Project
    commit: Commit
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
  | ProjectCreated

export interface IEventsHandlers {
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  evaluationRun: EventHandler<EvaluationRunEvent>[]
  documentRun: EventHandler<DocumentRunEvent>[]
  providerLogCreated: EventHandler<ProviderLogCreatedEvent>[]
  aiProviderCallCompleted: EventHandler<AIProviderCallCompletedEvent>[]
  workspaceCreated: EventHandler<WorkspaceCreatedEvent>[]
  projectCreated: EventHandler<ProjectCreated>[]
}

export const EventHandlers: IEventsHandlers = {
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  userCreated: [],
  evaluationRun: [createEvaluationResultJob],
  documentRun: [createDocumentLogJob],
  providerLogCreated: [],
  aiProviderCallCompleted: [],
  workspaceCreated: [],
  projectCreated: [],
} as const
