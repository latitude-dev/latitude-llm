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
import { compressString } from '@latitude-data/core/lib/disk/compression'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import { publishSpanCreated } from '@latitude-data/core/services/tracing/publishSpanCreated'
import { bulkCreate as bulkCreateClickHouseSpans } from '@latitude-data/core/services/tracing/spans/clickhouse/bulkCreate'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { findWorkspaceSubscription } from '@latitude-data/core/services/subscriptions/data-access/find'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '@latitude-data/core/plans'
import {
  captureException,
  captureMessage,
} from '@latitude-data/core/utils/datadogCapture'
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
      projectId: commit.projectId,
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
    documentLogUuid,
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

  const chEnabled = await isFeatureEnabledByName(
    workspace.id,
    'clickhouse-spans-write',
    database,
  )
  if (chEnabled.error) {
    captureException(
      new LatitudeError('Failed to resolve clickhouse-spans-write feature'),
      { workspaceId: workspace.id },
    )
  }

  if (chEnabled.ok && chEnabled.value) {
    const subscriptionResult = await findWorkspaceSubscription(
      { workspace },
      database,
    )
    if (subscriptionResult.error) {
      captureException(
        new LatitudeError(
          'Failed to resolve workspace subscription for spans',
        ),
        { workspaceId: workspace.id },
      )
    }

    const retentionDays =
      subscriptionResult.ok && subscriptionResult.value
        ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
        : DEFAULT_RETENTION_PERIOD_DAYS
    const retentionExpiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000,
    )

    const clickhouseResult = await bulkCreateClickHouseSpans([
      {
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
        endedAt: new Date(startedAt.getTime() + 500),
        metadata: promptMetadata,
        retentionExpiresAt,
      },
      {
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
        startedAt: new Date(startedAt.getTime() + 500),
        endedAt,
        metadata: completionMetadata,
        retentionExpiresAt,
      },
    ])
    if (clickhouseResult.error) {
      captureException(
        new LatitudeError('ClickHouse bulk span insertion failed'),
        {
          workspaceId: workspace.id,
          error: String(clickhouseResult.error),
        },
      )
    } else {
      captureMessage('ClickHouse bulk span insertion succeeded', 'info', {
        workspaceId: workspace.id,
        spansCount: 2,
      })
    }
  }

  await publishSpanCreated({
    spanId: promptSpanId,
    commitUuid: commit.uuid,
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
