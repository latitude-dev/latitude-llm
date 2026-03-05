import { addDays, differenceInMilliseconds } from 'date-fns'
import { cache as redis } from '../../../../cache'
import {
  ATTRIBUTES,
  type BaseSpanMetadata,
  Otlp,
  SPAN_METADATA_STORAGE_KEY,
  type SpanAttribute,
  type SpanEvent,
  SpanKind,
  type SpanLink,
  type SpanMetadata,
  SpanStatus,
  SpanType,
} from '../../../../constants'
import { type DiskWrapper, diskFactory } from '../../../../lib/disk'
import { compressString } from '../../../../lib/disk/compression'
import { LatitudeError, UnprocessableEntityError } from '../../../../lib/errors'
import { Result, type TypedResult } from '../../../../lib/Result'
import {
  DEFAULT_RETENTION_PERIOD_DAYS,
  SubscriptionPlans,
} from '../../../../plans'
import { findBySpanAndTraceIdPairs } from '../../../../queries/clickhouse/spans/findBySpanAndTraceIds'
import type { ApiKey } from '../../../../schema/models/types/ApiKey'
import type { Workspace } from '../../../../schema/models/types/Workspace'
import {
  captureException,
  captureMessage,
} from '../../../../utils/datadogCapture'
import { findWorkspaceSubscription } from '../../../subscriptions/data-access/find'
import { publishSpanCreated } from '../../publishSpanCreated'
import { bulkCreate as bulkCreateClickHouseSpans } from '../clickhouse/bulkCreate'
import { convertTimestamp } from '../shared'
import { SPAN_SPECIFICATIONS } from '../specifications'
import { resolveCaptureAttributes } from './captureReferences'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'

type SpanIngestionInput = {
  span: Otlp.Span
  scope: Otlp.Scope
  resource: Otlp.Resource
  apiKey: ApiKey
  workspace: Workspace
}

type CaptureResolution = Awaited<ReturnType<typeof resolveCaptureAttributes>>

/**
 * Converts a batch of OTLP spans into Latitude spans and persists them in
 * ClickHouse.
 */
export async function processSpansBulk(
  {
    spans: spansData,
    apiKey,
    workspace,
  }: {
    spans: SpanIngestionInput[]
    apiKey: ApiKey
    workspace: Workspace
  },
  disk: DiskWrapper = diskFactory('private'),
) {
  const captureResolutionCache = new Map<string, CaptureResolution>()
  const existingSpanSet = await getExistingSpanSet({ spansData, workspace })

  // Pre-process all spans to extract basic information and filter out invalid ones
  const processedSpans: Array<{
    id: string
    traceId: string
    parentId?: string
    commitUuid?: string
    documentUuid?: string
    documentLogUuid?: string
    projectId?: number
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
  }> = []

  // Process each span to extract basic information
  for (const spanData of spansData) {
    const { span, scope } = spanData

    if (existingSpanSet.has(`${span.traceId}-${span.spanId}`)) {
      continue
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
    let attributes = convertingsa.value

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

    const captureResolution = await resolveCaptureReferences({
      attributes,
      workspace,
      traceId,
      cache: captureResolutionCache,
    })
    if (captureResolution.error) {
      captureException(
        new UnprocessableEntityError(
          `Error resolving capture references: ${captureResolution.error}`,
        ),
      )
      continue
    }
    attributes = captureResolution.value

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
    if (extractingse.value !== undefined && extractingse.value !== null) {
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
    metadata = {
      ...metadata,
      ...processing.value,
    } as SpanMetadata

    // Transform UnresolvedExternal to External after resolution
    let finalType = type
    if (type === SpanType.UnresolvedExternal) {
      finalType = SpanType.External
    }

    processedSpans.push({
      id,
      traceId,
      parentId,
      commitUuid:
        (attributes[ATTRIBUTES.LATITUDE.commitUuid] as string) ?? undefined,
      documentUuid:
        (attributes[ATTRIBUTES.LATITUDE.documentUuid] as string) ?? undefined,
      documentLogUuid:
        (attributes[ATTRIBUTES.LATITUDE.documentLogUuid] as string) ??
        undefined,
      projectId:
        typeof attributes[ATTRIBUTES.LATITUDE.projectId] === 'number'
          ? (attributes[ATTRIBUTES.LATITUDE.projectId] as number)
          : Number(attributes[ATTRIBUTES.LATITUDE.projectId]) || undefined,
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

  const subscriptionResult = await findWorkspaceSubscription({ workspace })
  if (subscriptionResult.error) {
    captureException(
      new LatitudeError('Failed to resolve workspace subscription for spans'),
      {
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        spansCount: processedSpans.length,
        error: String(subscriptionResult.error),
      },
    )
  }

  const retentionDays =
    subscriptionResult.ok && subscriptionResult.value
      ? SubscriptionPlans[subscriptionResult.value.plan].retention_period
      : DEFAULT_RETENTION_PERIOD_DAYS
  const retentionExpiresAt = addDays(new Date(), retentionDays)

  const insertedSpans = processedSpans.map((s) => ({
    ...s,
    workspaceId: workspace.id,
    apiKeyId: apiKey.id,
  }))

  const clickhouseResult = await bulkCreateClickHouseSpans(
    insertedSpans.map((s) => ({
      ...s,
      retentionExpiresAt,
    })),
  )
  if (clickhouseResult.error) {
    return Result.error(clickhouseResult.error)
  }

  await saveMetadataBatch(
    {
      metadatas: processedSpans.map((p) => p.metadata),
      workspace,
    },
    disk,
  )

  captureMessage('ClickHouse bulk span insertion succeeded', 'info', {
    workspaceId: workspace.id,
    apiKeyId: apiKey.id,
    spansCount: processedSpans.length,
  })

  for (const span of insertedSpans) {
    publishSpanCreated({
      spanId: span.id,
      traceId: span.traceId,
      apiKeyId: apiKey.id,
      workspaceId: workspace.id,
      commitUuid: span.commitUuid,
      documentUuid: span.documentUuid,
      spanType: span.type,
      parentId: span.parentId,
      projectId: span.projectId,
    })
  }

  return Result.ok({ spans: insertedSpans })
}

/**
 * Resolves capture references for child spans that only contain
 * `latitude.prompt_path` + `latitude.project_id` baggage attributes.
 */
async function resolveCaptureReferences({
  attributes,
  workspace,
  traceId,
  cache,
}: {
  attributes: Record<string, SpanAttribute>
  workspace: Workspace
  traceId: string
  cache: Map<string, CaptureResolution>
}): Promise<TypedResult<Record<string, SpanAttribute>>> {
  const promptPath = attributes[ATTRIBUTES.LATITUDE.promptPath]
  const projectId = attributes[ATTRIBUTES.LATITUDE.projectId]
  if (!promptPath || !projectId) return Result.ok(attributes)

  const hasResolvedReferences =
    Boolean(attributes[ATTRIBUTES.LATITUDE.documentUuid]) &&
    Boolean(attributes[ATTRIBUTES.LATITUDE.commitUuid]) &&
    Boolean(attributes[ATTRIBUTES.LATITUDE.documentLogUuid])
  if (hasResolvedReferences) return Result.ok(attributes)

  const versionUuid = attributes[ATTRIBUTES.LATITUDE.commitUuid]
  const documentLogUuid = attributes[ATTRIBUTES.LATITUDE.documentLogUuid]
  const key = [
    traceId,
    String(promptPath),
    String(projectId),
    String(versionUuid ?? ''),
    String(documentLogUuid ?? ''),
  ].join('::')

  let resolving = cache.get(key)
  if (!resolving) {
    resolving = await resolveCaptureAttributes({
      attributes: {
        [ATTRIBUTES.LATITUDE.promptPath]: String(promptPath),
        [ATTRIBUTES.LATITUDE.projectId]: Number(projectId),
        ...(versionUuid && {
          [ATTRIBUTES.LATITUDE.commitUuid]: String(versionUuid),
        }),
        ...(documentLogUuid && {
          [ATTRIBUTES.LATITUDE.documentLogUuid]: String(documentLogUuid),
        }),
      },
      workspace,
    })

    cache.set(key, resolving)
  }

  if (resolving.error) return Result.error(resolving.error)

  const resolvedAttributes = {
    ...attributes,
    ...resolving.value,
  }

  if (attributes[ATTRIBUTES.LATITUDE.source]) {
    resolvedAttributes[ATTRIBUTES.LATITUDE.source] =
      attributes[ATTRIBUTES.LATITUDE.source]
  }

  return Result.ok(resolvedAttributes)
}

async function getExistingSpanSet({
  spansData,
  workspace,
}: {
  spansData: SpanIngestionInput[]
  workspace: Workspace
}) {
  const pairs = spansData.map(({ span }) => ({
    spanId: span.spanId,
    traceId: span.traceId,
  }))

  if (pairs.length === 0) return new Set<string>()

  const existingSpanSet = new Set<string>()
  const chunkSize = 250

  for (let i = 0; i < pairs.length; i += chunkSize) {
    const chunk = pairs.slice(i, i + chunkSize)

    try {
      const existing = await findBySpanAndTraceIdPairs({
        workspaceId: workspace.id,
        pairs: chunk,
      })

      for (const span of existing) {
        existingSpanSet.add(`${span.traceId}-${span.id}`)
      }
    } catch (error) {
      captureException(error as Error)
    }
  }

  return existingSpanSet
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
        const compressed = await compressString(payload)
        await disk.putBuffer(key, compressed).then((r) => r.unwrap())
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
