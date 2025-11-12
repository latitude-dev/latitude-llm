import {
  LogSources,
  Span,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/constants'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import { faker } from '@faker-js/faker'
import { createApiKey } from './apiKeys'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'

export async function createSpan({
  id = faker.string.alpha({ length: 16 }),
  traceId = faker.string.alpha({ length: 32 }),
  workspaceId,
  documentLogUuid,
  apiKeyId,
  parentId,
  name = 'span',
  kind = SpanKind.Client,
  type = SpanType.Prompt,
  status = SpanStatus.Ok,
  duration = 1000,
  startedAt = new Date(),
  endedAt = new Date(startedAt.getTime() + duration),
  createdAt,
  message,

  documentUuid,
  commitUuid,
  experimentUuid,

  source = LogSources.API,

  tokensPrompt,
  tokensCached,
  tokensReasoning,
  tokensCompletion,

  model,
  cost,
}: {
  id?: string
  traceId?: string
  workspaceId: number
  apiKeyId?: number
  parentId?: string
  documentLogUuid?: string
  name?: string
  kind?: SpanKind
  type?: SpanType
  status?: SpanStatus
  duration?: number
  startedAt?: Date
  endedAt?: Date
  createdAt?: Date
  message?: string

  documentUuid?: string
  commitUuid?: string
  experimentUuid?: string

  source?: LogSources

  tokensPrompt?: number
  tokensCached?: number
  tokensReasoning?: number
  tokensCompletion?: number

  model?: string
  cost?: number
}) {
  if (!apiKeyId) {
    const workspace = await unsafelyFindWorkspace(workspaceId)
    const { apiKey } = await createApiKey({
      workspace,
      name: faker.string.alpha(),
    })
    apiKeyId = apiKey.id
  }

  return database
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
      type,
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
    .then((r) => r[0]) as unknown as Span
}
