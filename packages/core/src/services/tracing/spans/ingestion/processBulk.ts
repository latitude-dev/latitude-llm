import { addDays, differenceInMilliseconds } from 'date-fns'
import { cache as redis } from '../../../../cache'
import { database } from '../../../../client'
import {
  ATTRIBUTES,
  BaseSpanMetadata,
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
import { compressString } from '../../../../lib/disk/compression'
import { LatitudeError, UnprocessableEntityError } from '../../../../lib/errors'
import { Result, TypedResult } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { SpansRepository } from '../../../../repositories'
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
import {
  captureException,
  captureMessage,
} from '../../../../utils/datadogCapture'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'
import { bulkCreate as bulkCreatePostgresSpans } from '../postgres/bulkCreate'
import { bulkCreate as bulkCreateClickHouseSpans } from '../clickhouse/bulkCreate'
import { UnresolvedExternalSpanSpecification } from '../specifications/unresolvedExternal'

type SpanIngestionInput = {
  span: Otlp.Span
  scope: Otlp.Scope
  resource: Otlp.Resource
  apiKey: ApiKey
  workspace: Workspace
}

type CaptureResolution = Awaited<
  ReturnType<typeof UnresolvedExternalSpanSpecification.process>
>

/**
 * Converts a batch of OTLP spans into Latitude spans and persists them in
 * Postgres (always) and ClickHouse (feature-flagged).
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
  transaction = new Transaction(),
  disk: DiskWrapper = diskFactory('private'),
) {
  const captureResolutionCache = new Map<string, CaptureResolution>()

  // Pre-process all spans to extract basic information and filter out invalid ones
  const processedSpans: Array<{
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
      type,
      status,
      scope,
      apiKey,
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
      const pgResult = await bulkCreatePostgresSpans(
        processedSpans.map((s) => ({
          ...s,
          workspaceId: workspace.id,
          apiKeyId: apiKey.id,
        })),
        tx,
      )
      if (pgResult.error) return pgResult

      const insertedSpans = pgResult.value

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
      if (chEnabled.error) {
        captureException(
          new LatitudeError('Failed to resolve clickhouse-spans-write feature'),
          {
            workspaceId: workspace.id,
            apiKeyId: apiKey.id,
            spansCount: processedSpans.length,
            error: String(chEnabled.error),
          },
        )
      }

      if (chEnabled.ok && chEnabled.value) {
        const subscriptionResult = await findWorkspaceSubscription(
          { workspace },
          tx,
        )
        if (subscriptionResult.error) {
          captureException(
            new LatitudeError(
              'Failed to resolve workspace subscription for spans',
            ),
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

        const clickhouseResult = await bulkCreateClickHouseSpans(
          processedSpans.map((s) => ({
            ...s,
            workspaceId: workspace.id,
            apiKeyId: apiKey.id,
            retentionExpiresAt,
          })),
        )
        if (clickhouseResult.error) {
          captureException(
            new LatitudeError('ClickHouse bulk span insertion failed'),
            {
              workspaceId: workspace.id,
              apiKeyId: apiKey.id,
              spansCount: processedSpans.length,
              error: String(clickhouseResult.error),
            },
          )
        } else {
          captureMessage('ClickHouse bulk span insertion succeeded', 'info', {
            workspaceId: workspace.id,
            apiKeyId: apiKey.id,
            spansCount: processedSpans.length,
          })
        }
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
          commitUuid: span.commitUuid,
          documentUuid: span.documentUuid,
          spanType: span.type,
          parentId: span.parentId,
          projectId: span.projectId,
        }),
      )
    },
  )
}

/**
 * Resolves capture references for child spans that only contain
 * `latitude.prompt_path` + `latitude.project_id` baggage attributes.
 */
async function resolveCaptureReferences({
  attributes,
  type,
  status,
  scope,
  apiKey,
  workspace,
  traceId,
  cache,
}: {
  attributes: Record<string, SpanAttribute>
  type: SpanType
  status: SpanStatus
  scope: Otlp.Scope
  apiKey: ApiKey
  workspace: Workspace
  traceId: string
  cache: Map<string, CaptureResolution>
}): Promise<TypedResult<Record<string, SpanAttribute>>> {
  if (type === SpanType.UnresolvedExternal) return Result.ok(attributes)

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
    resolving = await UnresolvedExternalSpanSpecification.process({
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
      status,
      scope,
      apiKey,
      workspace,
    })

    cache.set(key, resolving)
  }

  if (resolving.error) return Result.error(resolving.error)

  const resolvedAttributes: Record<string, SpanAttribute> = {
    ...attributes,
    [ATTRIBUTES.LATITUDE.projectId]: resolving.value.projectId,
  }

  if (resolving.value.promptUuid) {
    resolvedAttributes[ATTRIBUTES.LATITUDE.documentUuid] =
      resolving.value.promptUuid
  }

  if (resolving.value.documentLogUuid) {
    resolvedAttributes[ATTRIBUTES.LATITUDE.documentLogUuid] =
      resolving.value.documentLogUuid
  }

  if (resolving.value.versionUuid) {
    resolvedAttributes[ATTRIBUTES.LATITUDE.commitUuid] =
      resolving.value.versionUuid
  }

  const source =
    attributes[ATTRIBUTES.LATITUDE.source] ?? resolving.value.source
  if (source) {
    resolvedAttributes[ATTRIBUTES.LATITUDE.source] = source
  }

  return Result.ok(resolvedAttributes)
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

  const spansRepository = new SpansRepository(workspace.id, db, {
    useClickHouse: false,
  })

  // Use a more efficient batch query with IN clause
  const conditions = spanIds.map(({ spanId, traceId }) => ({
    spanId,
    traceId,
  }))

  // For now, we'll use individual queries but in a more optimized way
  // In the future, we could implement a proper batch query method in the repository
  const existingSpans: Span[] = []

  // Process in chunks to avoid overwhelming the database
  const chunkSize = 50
  for (let i = 0; i < conditions.length; i += chunkSize) {
    const chunk = conditions.slice(i, i + chunkSize)
    const chunkPromises = chunk.map(async ({ spanId, traceId }) => {
      const finding = await spansRepository.get({ spanId, traceId })
      return finding.error ? null : finding.value
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

/**
 * Extracts shared reference fields from raw span attributes so all span types
 * can be queried by project/document/commit even if their specification does
 * not set those fields directly.
 */
