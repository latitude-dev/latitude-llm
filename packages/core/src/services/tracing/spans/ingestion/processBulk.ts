import { addDays, differenceInMilliseconds } from 'date-fns'
import { cache as redis } from '../../../../cache'
import { database } from '../../../../client'
import {
  ATTRIBUTES,
  BaseSpanMetadata,
  CompletionSpanMetadata,
  Otlp,
  Span,
  SPAN_METADATA_STORAGE_KEY,
  SpanAttribute,
  SpanEvent,
  SpanKind,
  SpanLink,
  SpanMetadata,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { publishSpanCreated } from '../../publishSpanCreated'
import { diskFactory, DiskWrapper } from '../../../../lib/disk'
import { LatitudeError, UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { findSpan } from '../../../../queries/spans/findSpan'
import { spans } from '../../../../schema/models/spans'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { convertTimestamp } from '../shared'
import { SPAN_SPECIFICATIONS } from '../specifications'
import { isFeatureEnabledByName } from '../../../workspaceFeatures/isFeatureEnabledByName'
import { findWorkspaceSubscription } from '../../../subscriptions/data-access/find'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '../../../../plans'
import { captureException } from '../../../../utils/datadogCapture'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'
import { bulkCreate as bulkCreateClickHouseSpans } from '../clickhouse/bulkCreate'

export async function processSpansBulk(
  {
    spans: spansData,
    apiKey,
    workspace,
  }: {
    spans: Array<{
      span: Otlp.Span
      scope: Otlp.Scope
      resource: Otlp.Resource
      apiKey: ApiKey
      workspace: Workspace
    }>
    apiKey: ApiKey
    workspace: Workspace
  },
  transaction = new Transaction(),
  disk: DiskWrapper = diskFactory('private'),
) {
  // Pre-process all spans to extract basic information and filter out invalid ones
  const processedSpans: Array<{
    original: (typeof spansData)[0]
    id: string
    traceId: string
    parentId?: string
    name: string
    kind: SpanKind
    type: SpanType
    status: SpanStatus
    message?: string
    duration: number
    startedAt: Date
    endedAt: Date
    attributes: Record<string, SpanAttribute>
    events: SpanEvent[]
    links: SpanLink[]
    metadata: SpanMetadata
    documentLogUuid?: string
  }> = []

  // Batch check for existing spans to reduce database queries
  const spanIds = spansData.map(({ span }) => ({
    spanId: span.spanId,
    traceId: span.traceId,
  }))
  const existingSpans = await getExistingBatch({ spanIds, workspace })
  const existingSpanSet = new Set(
    existingSpans.map((span) => `${span.traceId}-${span.id}`),
  )

  // Process each span to extract basic information
  for (const spanData of spansData) {
    const { span, scope } = spanData

    // Check if span already exists using the batch result
    if (existingSpanSet.has(`${span.traceId}-${span.spanId}`)) {
      continue // Skip if already exists
    }

    // Convert span attributes
    const convertingsa = convertSpanAttributes(span.attributes || [])
    if (convertingsa.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting span attributes: ${convertingsa.error}`,
        ),
      )
      continue
    }
    const attributes = convertingsa.value

    const id = span.spanId
    const traceId = span.traceId
    const parentId = span.parentSpanId
    const name = span.name.slice(0, 128)

    // Convert span kind
    const convertingsk = convertSpanKind(span.kind)
    if (convertingsk.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting span kind: ${convertingsk.error}`,
        ),
      )
      continue
    }
    const kind = convertingsk.value

    // Extract span type
    const convertingst = extractSpanType(attributes)
    if (convertingst.error) {
      captureException(
        new UnprocessableEntityError(
          `Error extracting span type: ${convertingst.error}`,
        ),
      )
      continue
    }
    const type = convertingst.value

    // Check if span type is supported
    const specification = SPAN_SPECIFICATIONS[type]
    if (!specification) {
      captureException(
        new UnprocessableEntityError(`Invalid span type: ${type}`),
      )
      continue
    }

    // Convert span status
    const convertingss = convertSpanStatus(span.status || { code: 0 })
    if (convertingss.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting span status: ${convertingss.error}`,
        ),
      )
      continue
    }
    let status = convertingss.value

    let message = span.status?.message?.slice(0, 256)

    // Convert timestamps
    const convertingat = convertSpanTimestamp(span.startTimeUnixNano)
    if (convertingat.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting start timestamp: ${convertingat.error}`,
        ),
      )
      continue
    }
    const startedAt = convertingat.value

    const convertinget = convertSpanTimestamp(span.endTimeUnixNano)
    if (convertinget.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting end timestamp: ${convertinget.error}`,
        ),
      )
      continue
    }
    const endedAt = convertinget.value

    const duration = differenceInMilliseconds(endedAt, startedAt)
    if (duration < 0) {
      captureException(new UnprocessableEntityError('Invalid span duration'))
      continue
    }

    // Convert events and links
    const convertingse = convertSpanEvents(span.events || [])
    if (convertingse.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting span events: ${convertingse.error}`,
        ),
      )
      continue
    }
    const events = convertingse.value

    const convertingsl = convertSpanLinks(span.links || [])
    if (convertingsl.error) {
      captureException(
        new UnprocessableEntityError(
          `Error converting span links: ${convertingsl.error}`,
        ),
      )
      continue
    }
    const links = convertingsl.value

    // Extract span error
    const extractingse = extractSpanError(attributes, events)
    if (extractingse.error) {
      captureException(
        new UnprocessableEntityError(
          `Error extracting span error: ${extractingse.error}`,
        ),
      )
      continue
    }
    if (extractingse.value != undefined) {
      status = SpanStatus.Error
      message = extractingse.value?.slice(0, 256) || undefined
    }

    // Create base metadata
    let metadata = {
      ...({
        traceId: traceId,
        spanId: id,
        type: type,
        attributes: attributes,
        events: events,
        links: links,
      } satisfies BaseSpanMetadata),
    } as SpanMetadata

    // Process with specification
    const processing = await specification.process({
      attributes,
      status,
      scope,
      apiKey,
      workspace,
    })
    if (processing.error) {
      captureException(
        new UnprocessableEntityError(
          `Error processing span with specification: ${processing.error},`,
        ),
      )

      continue
    }
    metadata = { ...metadata, ...processing.value }

    // Transform UnresolvedExternal to External after resolution
    let finalType = type
    if (type === SpanType.UnresolvedExternal) {
      finalType = SpanType.External
    }

    processedSpans.push({
      original: spanData,
      id,
      traceId,
      parentId,
      name,
      kind,
      type: finalType,
      status,
      message,
      duration,
      startedAt,
      endedAt,
      attributes,
      events,
      links,
      metadata,
    })
  }

  if (processedSpans.length === 0) return Result.nil()

  // Bulk insert spans and save metadata
  return await transaction.call(
    async (tx) => {
      // Prepare bulk insert data
      const insertData = processedSpans.map((processed) => {
        let metadata
        if (processed.type === SpanType.Completion) {
          metadata = processed.metadata as CompletionSpanMetadata
        }

        return {
          id: processed.id,
          traceId: processed.traceId,
          parentId: processed.parentId,
          workspaceId: workspace.id,
          apiKeyId: apiKey.id,
          name: processed.name,
          kind: processed.kind,
          type: processed.type,
          status: processed.status,
          message: processed.message,
          duration: processed.duration,
          startedAt: processed.startedAt,
          endedAt: processed.endedAt,
          source:
            'source' in processed.metadata
              ? processed.metadata.source
              : undefined,

          // Tokens
          tokensPrompt: metadata?.tokens?.prompt,
          tokensCompletion: metadata?.tokens?.completion,
          tokensCached: metadata?.tokens?.cached,
          tokensReasoning: metadata?.tokens?.reasoning,

          // Cost
          model: metadata?.model,
          cost: metadata?.cost,

          // References
          documentLogUuid:
            'documentLogUuid' in processed.metadata
              ? (processed.metadata.documentLogUuid as string)
              : undefined,
          documentUuid:
            'promptUuid' in processed.metadata
              ? (processed.metadata.promptUuid as string)
              : undefined,
          commitUuid:
            'versionUuid' in processed.metadata
              ? (processed.metadata.versionUuid as string)
              : undefined,
          experimentUuid:
            'experimentUuid' in processed.metadata
              ? (processed.metadata.experimentUuid as string)
              : undefined,
          testDeploymentId:
            'testDeploymentId' in processed.metadata
              ? (processed.metadata.testDeploymentId as number)
              : undefined,
          projectId:
            'projectId' in processed.metadata
              ? (processed.metadata.projectId as number)
              : undefined,
          previousSpanId:
            'previousSpanId' in processed.metadata
              ? (processed.metadata.previousSpanId as string)
              : undefined,
        }
      })

      // Bulk insert spans
      const insertedSpans = await tx
        .insert(spans)
        .values(insertData)
        .returning()
        .then((r) => r as Span[])

      // Bulk save metadata using batch operations
      await saveMetadataBatch(
        {
          metadatas: processedSpans.map((p) => p.metadata),
          workspace,
        },
        disk,
      )

      const chEnabled = await isFeatureEnabledByName(
        workspace.id,
        'clickhouse-spans-write',
        tx,
      )
      if (chEnabled.ok && chEnabled.value) {
        const subscriptionResult = await findWorkspaceSubscription({
          workspace,
        })
        const retentionDays =
          subscriptionResult.ok && subscriptionResult.value
            ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
            : DEFAULT_RETENTION_PERIOD_DAYS
        const now = new Date()
        const retentionExpiresAt = addDays(now, retentionDays)

        bulkCreateClickHouseSpans(
          processedSpans.map((s) => ({
            ...s,
            workspaceId: workspace.id,
            apiKeyId: apiKey.id,
            retentionExpiresAt,
          })),
        )
      }

      return Result.ok({ spans: insertedSpans })
    },
    ({ spans: insertedSpans }) => {
      insertedSpans.forEach((span) =>
        publishSpanCreated({
          spanId: span.id,
          traceId: span.traceId,
          apiKeyId: apiKey.id,
          workspaceId: workspace.id,
          documentUuid: span.documentUuid,
          spanType: span.type,
          parentId: span.parentId,
        }),
      )
    },
  )
}

async function getExistingBatch(
  {
    spanIds,
    workspace,
  }: {
    spanIds: Array<{ spanId: string; traceId: string }>
    workspace: Workspace
  },
  db = database,
): Promise<Span[]> {
  if (spanIds.length === 0) {
    return []
  }

  const conditions = spanIds.map(({ spanId, traceId }) => ({
    spanId,
    traceId,
  }))

  const existingSpans: Span[] = []

  const chunkSize = 50
  for (let i = 0; i < conditions.length; i += chunkSize) {
    const chunk = conditions.slice(i, i + chunkSize)
    const chunkPromises = chunk.map(async ({ spanId, traceId }) => {
      return findSpan({ workspaceId: workspace.id, spanId, traceId }, db)
    })

    const chunkResults = await Promise.all(chunkPromises)
    existingSpans.push(...(chunkResults.filter(Boolean) as Span[]))
  }

  return existingSpans
}

async function saveMetadataBatch(
  {
    metadatas,
    workspace,
  }: {
    metadatas: SpanMetadata[]
    workspace: Workspace
  },
  disk: DiskWrapper,
): Promise<TypedResult> {
  const cache = await redis()
  const promises: Promise<void>[] = []

  for (const metadata of metadatas) {
    const key = SPAN_METADATA_STORAGE_KEY(
      workspace.id,
      metadata.traceId,
      metadata.spanId,
    )

    const promise = (async () => {
      try {
        const payload = JSON.stringify(metadata)
        await disk.put(key, payload).then((r) => r.unwrap())
        await cache.del(key)
      } catch (error) {
        captureException(new LatitudeError(`Error saving metadata:, ${error}`))
      }
    })()

    promises.push(promise)
  }

  await Promise.all(promises)
  return Result.nil()
}

function extractSpanError(
  attributes: Record<string, SpanAttribute>,
  events: SpanEvent[],
): TypedResult<string | null | undefined> {
  let error = String(attributes[ATTRIBUTES.OPENTELEMETRY.EXCEPTION.type] ?? '')
  let message = String(
    attributes[ATTRIBUTES.OPENTELEMETRY.EXCEPTION.message] ?? '',
  )
  if (error || message) return Result.ok(message || error || null)

  error = String(attributes[ATTRIBUTES.OPENTELEMETRY.ERROR.type] ?? '')
  if (error) return Result.ok(error || null)

  for (const { name, attributes } of events) {
    error = String(attributes[ATTRIBUTES.OPENTELEMETRY.EXCEPTION.type] ?? '')
    message = String(
      attributes[ATTRIBUTES.OPENTELEMETRY.EXCEPTION.message] ?? '',
    )
    if (error || message) return Result.ok(message || error || null)

    error = String(attributes[ATTRIBUTES.OPENTELEMETRY.ERROR.type] ?? '')
    if (error) return Result.ok(error || null)

    if (name === 'exception' || name === 'error') {
      return Result.ok('Unknown error')
    }
  }

  return Result.nil()
}

function convertSpanKind(kind: number): TypedResult<SpanKind> {
  switch (kind) {
    case Otlp.SpanKind.Internal:
      return Result.ok(SpanKind.Internal)
    case Otlp.SpanKind.Server:
      return Result.ok(SpanKind.Server)
    case Otlp.SpanKind.Client:
      return Result.ok(SpanKind.Client)
    case Otlp.SpanKind.Producer:
      return Result.ok(SpanKind.Producer)
    case Otlp.SpanKind.Consumer:
      return Result.ok(SpanKind.Consumer)
    default:
      return Result.error(new UnprocessableEntityError('Invalid span kind'))
  }
}

function convertSpanTimestamp(timestamp: string): TypedResult<Date> {
  const date = convertTimestamp(timestamp)
  return Result.ok(date)
}

function convertSpanEvents(events: Otlp.Event[]): TypedResult<SpanEvent[]> {
  const result: SpanEvent[] = []

  for (const event of events) {
    const convertinget = convertSpanTimestamp(event.timeUnixNano)
    if (convertinget.error) return Result.error(convertinget.error)
    const timestamp = convertinget.value

    const convertingea = convertSpanAttributes(event.attributes || [])
    if (convertingea.error) return Result.error(convertingea.error)
    const attributes = convertingea.value

    result.push({ name: event.name, timestamp, attributes })
  }

  return Result.ok(result)
}

function convertSpanLinks(links: Otlp.Link[]): TypedResult<SpanLink[]> {
  const result: SpanLink[] = []

  for (const link of links) {
    const converting = convertSpanAttributes(link.attributes || [])
    if (converting.error) return Result.error(converting.error)
    const attributes = converting.value

    result.push({ traceId: link.traceId, spanId: link.spanId, attributes })
  }

  return Result.ok(result)
}
