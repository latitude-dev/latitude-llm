import { ToolCall } from '@latitude-data/compiler'
import { CompletionTokenUsage } from 'ai'

import {
  ChainCallResponse,
  LogSources,
  MagicLinkToken,
  Membership,
  Message,
  Providers,
  User,
} from '../../browser'
import { PartialConfig } from '../../services/ai'
import { createEvaluationResultJob } from './createEvaluationResultJob'
import { createProviderLogJob } from './createProviderLogJob'
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

export type AIProviderCallCompleted = LatitudeEventGeneric<
  'aiProviderCallCompleted',
  {
    uuid: string
    source: LogSources
    generatedAt: Date
    documentLogUuid?: string
    providerId: number
    providerType: Providers
    model: string
    config: PartialConfig
    messages: Message[]
    responseText: string
    toolCalls?: ToolCall[]
    usage: CompletionTokenUsage
    duration: number
  }
>
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

export type LatitudeEvent =
  | MembershipCreatedEvent
  | UserCreatedEvent
  | MagicLinkTokenCreated
  | AIProviderCallCompleted
  | EvaluationRunEvent
  | DocumentRunEvent

export interface IEventsHandlers {
  aiProviderCallCompleted: EventHandler<AIProviderCallCompleted>[]
  magicLinkTokenCreated: EventHandler<MagicLinkTokenCreated>[]
  membershipCreated: EventHandler<MembershipCreatedEvent>[]
  userCreated: EventHandler<UserCreatedEvent>[]
  evaluationRun: EventHandler<EvaluationRunEvent>[]
  documentRun: EventHandler<DocumentRunEvent>[]
}

export const EventHandlers: IEventsHandlers = {
  magicLinkTokenCreated: [sendMagicLinkJob],
  membershipCreated: [sendInvitationToUserJob],
  userCreated: [],
  aiProviderCallCompleted: [createProviderLogJob],
  evaluationRun: [createEvaluationResultJob],
  documentRun: [createDocumentLogJob],
} as const
