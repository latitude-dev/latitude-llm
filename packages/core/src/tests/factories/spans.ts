import {
  LogSources,
  Span,
  SpanKind,
  SpanMetadata,
  SpanStatus,
  SpanType,
  SpanWithDetails,
} from '@latitude-data/constants'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import { faker } from '@faker-js/faker'
import { createApiKey } from './apiKeys'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'

export async function createSpan<T extends SpanType = SpanType.Prompt>({
  id = faker.string.alpha({ length: 16 }),
  traceId = faker.string.alpha({ length: 32 }),
  workspaceId,
  documentLogUuid,
  apiKeyId,
  parentId,
  name = 'span',
  kind = SpanKind.Client,
  type: spanType,
  status = SpanStatus.Ok,
  duration = 1000,
  startedAt = new Date(),
  endedAt = new Date(startedAt.getTime() + duration),
  createdAt,
  message,

  documentUuid,
  commitUuid,
  experimentUuid,
  projectId,

  source = LogSources.API,

  tokensPrompt,
  tokensCached,
  tokensReasoning,
  tokensCompletion,

  model,
  cost,
  metadata,
}: {
  id?: string
  traceId?: string
  workspaceId: number
  apiKeyId?: number
  parentId?: string
  documentLogUuid?: string
  name?: string
  kind?: SpanKind
  type?: T
  status?: SpanStatus
  duration?: number
  startedAt?: Date
  endedAt?: Date
  createdAt?: Date
  message?: string

  documentUuid?: string
  commitUuid?: string
  experimentUuid?: string
  projectId?: number

  source?: LogSources

  tokensPrompt?: number
  tokensCached?: number
  tokensReasoning?: number
  tokensCompletion?: number

  model?: string
  cost?: number
  metadata?: SpanMetadata<T>
}) {
  if (!apiKeyId) {
    const workspace = await unsafelyFindWorkspace(workspaceId)
    const { apiKey } = await createApiKey({
      workspace,
      name: faker.string.alpha(),
    })
    apiKeyId = apiKey.id
  }

  const span = (await database
    .insert(spans)
    .values({
      id,
      traceId,
      documentLogUuid,
      parentId,
      workspaceId,
      apiKeyId,
      name,
      kind,
      type: spanType ?? SpanType.Prompt,
      status,
      message,
      duration,
      startedAt,
      endedAt,
      createdAt,

      // references
      documentUuid,
      commitUuid,
      experimentUuid,
      projectId,

      // source
      source,

      // tokens
      tokensPrompt,
      tokensCached,
      tokensReasoning,
      tokensCompletion,

      // cost & model
      model,
      cost,
    })
    .returning()
    .then((r) => r[0])) as unknown as Span

  return {
    ...span,
    metadata: metadata ?? ({} as SpanMetadata<T>),
  } as SpanWithDetails<T>
}
