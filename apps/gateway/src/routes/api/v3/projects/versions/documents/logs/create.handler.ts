import { getData } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { cache as redis } from '@latitude-data/core/cache'
import { database } from '@latitude-data/core/client'
import {
  ATTRIBUTES,
  CompletionSpanMetadata,
  LogSources,
  PromptSpanMetadata,
  SPAN_METADATA_STORAGE_KEY,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { diskFactory } from '@latitude-data/core/lib/disk'
import { compressString } from '@latitude-data/core/lib/disk/compression'
import { spans } from '@latitude-data/core/schema/models/spans'
import type { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { publishSpanCreated } from '@latitude-data/core/services/tracing/publishSpanCreated'
import { randomBytes } from 'crypto'
import { CreateLogRoute } from './create.route'

// @ts-expect-error: broken types
export const createLogHandler: AppRouteHandler<CreateLogRoute> = async (c) => {
  const workspace = c.get('workspace')
  const apiKey = c.get('apiKey')
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, messages, response } = c.req.valid('json')
  const { document, commit } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: path!,
  }).then((r) => r.unwrap())
  const last = messages[messages.length - 1]
  const content = last ? last.content : undefined

  const { documentLogUuid, promptSpanId, completionSpanId, traceId } =
    await createSpansFromLogData({
      workspace,
      apiKey,
      document,
      commit,
      messages,
      response,
      content,
    })

  return c.json(
    {
      uuid: documentLogUuid,
      documentUuid: document.documentUuid,
      promptSpan: {
        id: promptSpanId,
        traceId,
      },
      completionSpan: {
        id: completionSpanId,
        traceId,
      },
    },
    200,
  )
}

// NOTE: This is a temporary solution since we don't want people using this method so do not abstract the implementation to core.
async function createSpansFromLogData({
  workspace,
  apiKey,
  document,
  commit,
  messages,
  response,
  content,
}: {
  workspace: Workspace
  apiKey: ApiKey
  document: DocumentVersion
  commit: Commit
  messages: unknown[]
  response?: string
  content?: unknown
}) {
  // Generate IDs for spans
  const traceId = randomBytes(16).toString('hex')
  const promptSpanId = randomBytes(8).toString('hex')
  const completionSpanId = randomBytes(8).toString('hex')
  const documentLogUuid = randomBytes(16).toString('hex')

  const now = new Date()
  const startedAt = new Date(now.getTime() - 1000) // 1 second ago
  const endedAt = now

  // Create prompt span
  await database
    .insert(spans)
    .values({
      id: promptSpanId,
      traceId: traceId,
      documentLogUuid: documentLogUuid,
      workspaceId: workspace.id,
      projectId: commit.projectId,
      apiKeyId: apiKey.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      name: document.path.split('/').pop() ?? 'prompt',
      kind: SpanKind.Client,
      type: SpanType.Prompt,
      source: LogSources.API,
      status: SpanStatus.Ok,
      duration: endedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt,
      endedAt: endedAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const tokens = {
    prompt: 0,
    cached: 0,
    reasoning: 0,
    completion: 0,
  }

  // Create completion span
  await database
    .insert(spans)
    .values({
      id: completionSpanId,
      traceId: traceId,
      documentLogUuid: documentLogUuid,
      parentId: promptSpanId,
      workspaceId: workspace.id,
      projectId: commit.projectId,
      apiKeyId: apiKey.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      name: 'completion',
      kind: SpanKind.Client,
      type: SpanType.Completion,
      source: LogSources.API,
      status: SpanStatus.Ok,
      duration: endedAt.getTime() - startedAt.getTime(),
      startedAt: startedAt,
      endedAt: endedAt,
      createdAt: now,
      updatedAt: now,
      tokensPrompt: null, // TODO: Add tokens prompt
      tokensCompletion: null, // TODO: Add tokens completion
    })
    .returning()

  // Create metadata for prompt span
  const promptMetadata: PromptSpanMetadata = {
    traceId: traceId,
    spanId: promptSpanId,
    type: SpanType.Prompt,
    attributes: {
      // TODO: CHECK IF THIS IS RIGHT
      [ATTRIBUTES.LATITUDE.type]: SpanType.Prompt,
      [ATTRIBUTES.LATITUDE.request.template]: document.content,
      [ATTRIBUTES.LATITUDE.request.parameters]: JSON.stringify({}),
      [ATTRIBUTES.LATITUDE.documentUuid]: document.documentUuid,
      [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
      [ATTRIBUTES.LATITUDE.source]: LogSources.API,
    },
    events: [],
    links: [],
    source: LogSources.API,
    documentLogUuid: documentLogUuid,
    projectId: commit.projectId,
    promptUuid: document.documentUuid,
    versionUuid: commit.uuid,
    parameters: {},
    template: document.content,
  }

  const completionMetadata: CompletionSpanMetadata = {
    traceId: traceId,
    spanId: completionSpanId,
    type: SpanType.Completion,
    attributes: {
      // TODO: CHECK IF THIS IS RIGHT
      [ATTRIBUTES.LATITUDE.type]: SpanType.Completion,
      [ATTRIBUTES.LATITUDE.request.messages]: JSON.stringify(messages),
      [ATTRIBUTES.LATITUDE.response.messages]: JSON.stringify([
        {
          role: 'assistant',
          content:
            typeof responseText === 'string'
              ? responseText
              : JSON.stringify(responseText),
        },
      ]),
      [ATTRIBUTES.LATITUDE.documentUuid]: document.documentUuid,
      [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
    },
    events: [],
    links: [],
    source: LogSources.API,
    documentLogUuid: documentLogUuid,
    projectId: commit.projectId,
    promptUuid: document.documentUuid,
    versionUuid: commit.uuid,
    provider: 'unknown',
    model: 'unknown',
    configuration: {
      provider: 'unknown',
      model: 'unknown',
    },
    input: [], // TODO: Add input
    output: [], // TODO: Add output
    tokens: tokens,
    cost: 0,
    finishReason: 'stop',
  }

  // Save metadata to disk
  const disk = diskFactory('private')
  const cache = await redis()

  const promptMetadataKey = SPAN_METADATA_STORAGE_KEY(
    workspace.id,
    traceId,
    promptSpanId,
  )
  const compressedPromptMetadata = await compressString(
    JSON.stringify(promptMetadata),
  )
  await disk
    .putBuffer(promptMetadataKey, compressedPromptMetadata)
    .then((r) => r.unwrap())
  await cache.del(promptMetadataKey)

  const completionMetadataKey = SPAN_METADATA_STORAGE_KEY(
    workspace.id,
    traceId,
    completionSpanId,
  )
  const compressedCompletionMetadata = await compressString(
    JSON.stringify(completionMetadata),
  )
  await disk
    .putBuffer(completionMetadataKey, compressedCompletionMetadata)
    .then((r) => r.unwrap())
  await cache.del(completionMetadataKey)

  await publishSpanCreated({
    spanId: promptSpanId,
    traceId,
    apiKeyId: apiKey.id,
    workspaceId: workspace.id,
    documentUuid: document.documentUuid,
    spanType: SpanType.Prompt,
    parentId: null,
    projectId: commit.projectId,
  })

  return {
    documentLogUuid,
    promptSpanId,
    completionSpanId,
    traceId,
  }
}
