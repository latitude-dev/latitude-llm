import { getData } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { cache as redis } from '@latitude-data/core/cache'
import { database } from '@latitude-data/core/client'
import {
  ATTRIBUTES,
  CompletionSpanMetadata,
  LogSources,
  Message,
  PromptSpanMetadata,
  SPAN_METADATA_STORAGE_KEY,
  SpanKind,
  SpanStatus,
  SpanType,
} from '@latitude-data/core/constants'
import { diskFactory } from '@latitude-data/core/lib/disk'
import { compressString } from '@latitude-data/core/lib/disk/compression'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '@latitude-data/core/plans'
import { spans } from '@latitude-data/core/schema/models/spans'
import type { ApiKey } from '@latitude-data/core/schema/models/types/ApiKey'
import type { Commit } from '@latitude-data/core/schema/models/types/Commit'
import type { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import type { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { findWorkspaceSubscription } from '@latitude-data/core/services/subscriptions/data-access/find'
import { publishSpanCreated } from '@latitude-data/core/services/tracing/publishSpanCreated'
import { bulkCreate as bulkCreateClickHouseSpans } from '@latitude-data/core/services/tracing/spans/clickhouse/bulkCreate'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import {
  captureException,
  captureMessage,
} from '@latitude-data/core/utils/datadogCapture'
import { randomBytes } from 'crypto'
import { Provider, Translator } from 'rosetta-ai'
import { CreateLogRoute } from './create.route'

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'passthrough',
})

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

  const { documentLogUuid, promptSpanId, completionSpanId, traceId } =
    await createSpansFromLogData({
      workspace,
      apiKey,
      document,
      commit,
      messages,
      response,
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
}: {
  workspace: Workspace
  apiKey: ApiKey
  document: DocumentVersion
  commit: Commit
  messages: Record<string, unknown>[]
  response?: string
}) {
  // Generate IDs for spans
  const traceId = randomBytes(16).toString('hex')
  const promptSpanId = randomBytes(8).toString('hex')
  const completionSpanId = randomBytes(8).toString('hex')
  const documentLogUuid = randomBytes(16).toString('hex')

  const now = new Date()
  const startedAt = new Date(now.getTime() - 1000) // 1 second ago
  const endedAt = now

  const inputting = translator.safeTranslate(messages, {
    to: Provider.Promptl,
    direction: 'input',
  })
  if (inputting.error) captureException(inputting.error)
  const input = (inputting.messages ?? []) as Message[]

  let output
  if (response) {
    const outputting = translator.safeTranslate(response, {
      to: Provider.Promptl,
      direction: 'output',
    })
    if (outputting.error) captureException(outputting.error)
    output = (outputting.messages ?? []) as Message[]
  }

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
    })
    .returning()

  // Create metadata for prompt span
  const promptMetadata: PromptSpanMetadata = {
    traceId: traceId,
    spanId: promptSpanId,
    type: SpanType.Prompt,
    attributes: {
      [ATTRIBUTES.LATITUDE.type]: SpanType.Prompt,
      [ATTRIBUTES.LATITUDE.source]: LogSources.API,
      [ATTRIBUTES.LATITUDE.projectId]: String(commit.projectId),
      [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
      [ATTRIBUTES.LATITUDE.documentUuid]: document.documentUuid,
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
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
      [ATTRIBUTES.LATITUDE.type]: SpanType.Completion,
      [ATTRIBUTES.LATITUDE.source]: LogSources.API,
      [ATTRIBUTES.LATITUDE.projectId]: String(commit.projectId),
      [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
      [ATTRIBUTES.LATITUDE.documentUuid]: document.documentUuid,
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
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
    input: input,
    output: output,
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
        new LatitudeError('Failed to resolve workspace subscription for spans'),
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
        traceId: traceId,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        name: document.path.split('/').pop() ?? 'prompt',
        kind: SpanKind.Client,
        type: SpanType.Prompt,
        status: SpanStatus.Ok,
        duration: endedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt,
        endedAt: endedAt,
        metadata: promptMetadata,
        retentionExpiresAt,
      },
      {
        id: completionSpanId,
        traceId: traceId,
        parentId: promptSpanId,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        name: 'completion',
        kind: SpanKind.Client,
        type: SpanType.Completion,
        status: SpanStatus.Ok,
        duration: endedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt,
        endedAt: endedAt,
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
    traceId: traceId,
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
