import { randomBytes } from 'crypto'
import { database } from '@latitude-data/core/client'
import {
  LogSources,
  PromptSpanMetadata,
  CompletionSpanMetadata,
  SPAN_METADATA_STORAGE_KEY,
  SpanKind,
  SpanStatus,
  SpanType,
  ATTRIBUTES,
} from '@latitude-data/core/constants'
import { cache as redis } from '@latitude-data/core/cache'
import { diskFactory } from '@latitude-data/core/lib/disk'
import { publisher } from '@latitude-data/core/events/publisher'
import { AppRouteHandler } from '$/openApi/types'
import { CreateLogRoute } from './create.route'
import { getData } from '$/common/documents/getData'
import { spans } from '@latitude-data/core/schema/models/spans'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import type { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'

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
  const duration = endedAt.getTime() - startedAt.getTime()

  // Create prompt span
  await database
    .insert(spans)
    .values({
      id: promptSpanId,
      traceId,
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      name: 'prompt',
      kind: SpanKind.Client,
      type: SpanType.Prompt,
      status: SpanStatus.Ok,
      duration,
      startedAt,
      endedAt: new Date(startedAt.getTime() + 500), // Midpoint
      documentLogUuid,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      source: LogSources.API,
    })
    .returning()

  // Create completion span
  await database
    .insert(spans)
    .values({
      id: completionSpanId,
      traceId,
      parentId: promptSpanId,
      workspaceId: workspace.id,
      apiKeyId: apiKey.id,
      name: 'completion',
      kind: SpanKind.Client,
      type: SpanType.Completion,
      status: SpanStatus.Ok,
      duration,
      startedAt: new Date(startedAt.getTime() + 500), // After prompt
      endedAt,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })
    .returning()

  // Create metadata for prompt span
  const promptMetadata: PromptSpanMetadata = {
    traceId,
    spanId: promptSpanId,
    type: SpanType.Prompt,
    attributes: {
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
    template: document.content,
    parameters: {},
    promptUuid: document.documentUuid,
    projectId: commit.projectId,
    versionUuid: commit.uuid,
    source: LogSources.API,
    experimentUuid: '',
    externalId: '',
  }

  // Create metadata for completion span
  let responseText: string = response || ''
  if (!responseText && content) {
    if (typeof content === 'string') {
      responseText = content
    } else if (Array.isArray(content)) {
      const textContent = content.find((c: any) => c.type === 'text')
      responseText =
        textContent && 'text' in textContent ? textContent.text : ''
    } else if (
      typeof content === 'object' &&
      content !== null &&
      'text' in content
    ) {
      responseText = (content as { text: string }).text
    }
  }
  const completionMetadata: CompletionSpanMetadata = {
    traceId,
    spanId: completionSpanId,
    type: SpanType.Completion,
    attributes: {
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
    provider: 'unknown',
    model: 'unknown',
    configuration: {},
    input: messages as any,
    output: [
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text:
              typeof responseText === 'string'
                ? responseText
                : JSON.stringify(responseText),
          },
        ],
      },
    ] as any,
  }

  // Save metadata to disk
  const disk = diskFactory('private')
  const cache = await redis()

  const promptMetadataKey = SPAN_METADATA_STORAGE_KEY(
    workspace.id,
    traceId,
    promptSpanId,
  )
  await disk
    .put(promptMetadataKey, JSON.stringify(promptMetadata))
    .then((r) => r.unwrap())
  await cache.del(promptMetadataKey)

  const completionMetadataKey = SPAN_METADATA_STORAGE_KEY(
    workspace.id,
    traceId,
    completionSpanId,
  )
  await disk
    .put(completionMetadataKey, JSON.stringify(completionMetadata))
    .then((r) => r.unwrap())
  await cache.del(completionMetadataKey)

  await publisher.publishLater({
    type: 'spanCreated',
    data: {
      spanId: promptSpanId,
      traceId,
      apiKeyId: apiKey.id,
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
    },
  })

  return {
    documentLogUuid,
    promptSpanId,
    completionSpanId,
    traceId,
  }
}
