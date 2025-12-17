import {
  ATTR_ERROR_TYPE,
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions'
import {
  ATTR_GEN_AI_OPERATION_NAME,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
  GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from '@opentelemetry/semantic-conventions/incubating'
import { differenceInMilliseconds } from 'date-fns'
import { cache as redis } from '../../../cache'
import { database } from '../../../client'
import {
  AI_OPERATION_ID_VALUE_GENERATE_OBJECT,
  AI_OPERATION_ID_VALUE_GENERATE_TEXT,
  AI_OPERATION_ID_VALUE_STREAM_OBJECT,
  AI_OPERATION_ID_VALUE_STREAM_TEXT,
  AI_OPERATION_ID_VALUE_TOOL,
  ATTR_AI_OPERATION_ID,
  ATTR_LATITUDE_TYPE,
  ATTR_LLM_REQUEST_TYPE,
  BaseSpanMetadata,
  CompletionSpanMetadata,
  GEN_AI_OPERATION_NAME_VALUE_COMPLETION,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDING,
  GEN_AI_OPERATION_NAME_VALUE_RERANKING,
  GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
  GEN_AI_OPERATION_NAME_VALUE_TOOL,
  LLM_REQUEST_TYPE_VALUE_CHAT,
  LLM_REQUEST_TYPE_VALUE_COMPLETION,
  LLM_REQUEST_TYPE_VALUE_EMBEDDING,
  LLM_REQUEST_TYPE_VALUE_RERANK,
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
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { LatitudeError, UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { SpansRepository } from '../../../repositories'
import { spans } from '../../../schema/models/spans'
import { type ApiKey } from '../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { convertTimestamp } from './shared'
import { SPAN_SPECIFICATIONS } from './specifications'
import { captureException } from '../../../utils/datadogCapture'

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
  return await transaction.call(async (tx) => {
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

    // Publish events for all spans
    const eventPromises = insertedSpans.map((span) =>
      publisher.publishLater({
        type: 'spanCreated',
        data: {
          spanId: span.id,
          traceId: span.traceId,
          apiKeyId: apiKey.id,
          workspaceId: workspace.id,
          documentUuid: span.documentUuid,
        },
      }),
    )
    await Promise.all(eventPromises)

    return Result.ok({ spans: insertedSpans })
  })
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

  const spansRepository = new SpansRepository(workspace.id, db)

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

function convertSpanAttribute(
  attribute: Otlp.AttributeValue,
): TypedResult<SpanAttribute> {
  if (attribute.stringValue != undefined) {
    return Result.ok(attribute.stringValue)
  }

  if (attribute.intValue != undefined) {
    return Result.ok(attribute.intValue)
  }

  if (attribute.boolValue != undefined) {
    return Result.ok(attribute.boolValue)
  }

  if (attribute.arrayValue != undefined) {
    const values = attribute.arrayValue.values.map(convertSpanAttribute)
    if (values.some((v) => v.error)) return Result.error(values[0]!.error!)

    return Result.ok(values.map((v) => v.value!))
  }

  return Result.error(new UnprocessableEntityError('Invalid attribute value'))
}

export function convertSpanAttributes(
  attributes: Otlp.Attribute[],
): TypedResult<Record<string, SpanAttribute>> {
  const result: Record<string, SpanAttribute> = {}

  for (const attribute of attributes) {
    const converting = convertSpanAttribute(attribute.value)
    if (converting.error) continue // ignore attributes we can't convert

    result[attribute.key] = converting.value
  }

  return Result.ok(result)
}

export function extractSpanType(
  attributes: Record<string, SpanAttribute>,
): TypedResult<SpanType> {
  const type = String(attributes[ATTR_LATITUDE_TYPE] ?? '')
  switch (type) {
    case SpanType.Tool:
      return Result.ok(SpanType.Tool)
    case SpanType.Completion:
      return Result.ok(SpanType.Completion)
    case SpanType.Embedding:
      return Result.ok(SpanType.Embedding)
    case SpanType.Retrieval:
      return Result.ok(SpanType.Retrieval)
    case SpanType.Reranking:
      return Result.ok(SpanType.Reranking)
    case SpanType.Http:
      return Result.ok(SpanType.Http)
    case SpanType.Prompt:
      return Result.ok(SpanType.Prompt)
    case SpanType.Chat:
      return Result.ok(SpanType.Chat)
    case SpanType.External:
      return Result.ok(SpanType.External)
    case SpanType.UnresolvedExternal:
      return Result.ok(SpanType.UnresolvedExternal)
    case SpanType.Step:
      return Result.ok(SpanType.Step)
    case SpanType.Unknown:
      return Result.ok(SpanType.Unknown)
  }

  let operation = String(attributes[ATTR_GEN_AI_OPERATION_NAME] ?? '')
  switch (operation) {
    case GEN_AI_OPERATION_NAME_VALUE_TOOL:
    case GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL:
      return Result.ok(SpanType.Tool)
    case GEN_AI_OPERATION_NAME_VALUE_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_CHAT:
    case GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT:
      return Result.ok(SpanType.Completion)
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDING:
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS:
      return Result.ok(SpanType.Embedding)
    case GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL:
      return Result.ok(SpanType.Retrieval)
    case GEN_AI_OPERATION_NAME_VALUE_RERANKING:
      return Result.ok(SpanType.Reranking)
  }

  const request = String(attributes[ATTR_LLM_REQUEST_TYPE] ?? '')
  switch (request) {
    case LLM_REQUEST_TYPE_VALUE_COMPLETION:
    case LLM_REQUEST_TYPE_VALUE_CHAT:
      return Result.ok(SpanType.Completion)
    case LLM_REQUEST_TYPE_VALUE_EMBEDDING:
      return Result.ok(SpanType.Embedding)
    case LLM_REQUEST_TYPE_VALUE_RERANK:
      return Result.ok(SpanType.Reranking)
  }

  operation = String(attributes[ATTR_AI_OPERATION_ID] ?? '')
  switch (operation) {
    case AI_OPERATION_ID_VALUE_TOOL:
      return Result.ok(SpanType.Tool)
    case AI_OPERATION_ID_VALUE_GENERATE_TEXT:
    case AI_OPERATION_ID_VALUE_STREAM_TEXT:
    case AI_OPERATION_ID_VALUE_GENERATE_OBJECT:
    case AI_OPERATION_ID_VALUE_STREAM_OBJECT:
      return Result.ok(SpanType.Completion)
  }

  return Result.ok(SpanType.Unknown)
}

export function convertSpanStatus(
  status: Otlp.Status,
): TypedResult<SpanStatus> {
  switch (status.code) {
    case Otlp.StatusCode.Ok:
      return Result.ok(SpanStatus.Ok)
    case Otlp.StatusCode.Error:
      return Result.ok(SpanStatus.Error)
    default:
      return Result.ok(SpanStatus.Unset)
  }
}

function extractSpanError(
  attributes: Record<string, SpanAttribute>,
  events: SpanEvent[],
): TypedResult<string | null | undefined> {
  let error = String(attributes[ATTR_EXCEPTION_TYPE] ?? '')
  let message = String(attributes[ATTR_EXCEPTION_MESSAGE] ?? '')
  if (error || message) return Result.ok(message || error || null)

  error = String(attributes[ATTR_ERROR_TYPE] ?? '')
  if (error) return Result.ok(error || null)

  for (const { name, attributes } of events) {
    error = String(attributes[ATTR_EXCEPTION_TYPE] ?? '')
    message = String(attributes[ATTR_EXCEPTION_MESSAGE] ?? '')
    if (error || message) return Result.ok(message || error || null)

    error = String(attributes[ATTR_ERROR_TYPE] ?? '')
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
