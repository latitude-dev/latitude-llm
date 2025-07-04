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
import { z } from 'zod'
import {
  AI_OPERATION_ID_VALUE_GENERATE_OBJECT,
  AI_OPERATION_ID_VALUE_GENERATE_TEXT,
  AI_OPERATION_ID_VALUE_STREAM_OBJECT,
  AI_OPERATION_ID_VALUE_STREAM_TEXT,
  AI_OPERATION_ID_VALUE_TOOL,
  ApiKey,
  ATTR_AI_OPERATION_ID,
  ATTR_LATITUDE_SEGMENTS,
  ATTR_LATITUDE_TYPE,
  ATTR_LLM_REQUEST_TYPE,
  BaseSpanMetadata,
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
  SegmentBaggage,
  segmentBaggageSchema,
  Span,
  SPAN_METADATA_STORAGE_KEY,
  SpanAttribute,
  SpanEvent,
  SpanKind,
  SpanLink,
  SpanMetadata,
  SpanStatus,
  SpanType,
  SpanWithDetails,
  TRACING_JOBS_MAX_ATTEMPTS,
  Workspace,
} from '../../../browser'
import { cache as redis } from '../../../cache'
import { database, Database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { processSegmentJobKey } from '../../../jobs/job-definitions/tracing/processSegmentJob'
import { tracingQueue } from '../../../jobs/queues'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { SpanMetadatasRepository, SpansRepository } from '../../../repositories'
import { spans } from '../../../schema'
import { convertTimestamp } from './shared'
import { SPAN_SPECIFICATIONS } from './specifications'

export async function processSpan(
  {
    span,
    scope,
    apiKey,
    workspace,
  }: {
    span: Otlp.Span
    scope: Otlp.Scope
    apiKey: ApiKey
    workspace: Workspace
  },
  db: Database = database,
  disk: DiskWrapper = diskFactory('private'),
) {
  const getting = await getExisting({ span, workspace }, db)
  if (getting.error) return Result.error(getting.error)
  const existing = getting.value

  if (existing) return Result.ok({ span: existing })

  const convertingsa = convertSpanAttributes(span.attributes || [])
  if (convertingsa.error) return Result.error(convertingsa.error)
  const attributes = convertingsa.value

  const extractingsb = extractSegmentsBaggage(attributes)
  if (extractingsb.error) return Result.error(extractingsb.error)
  const segments = extractingsb.value

  const id = span.spanId

  const traceId = span.traceId

  const segmentId = segments.at(-1)?.id

  const parentId = span.parentSpanId

  const name = span.name.slice(0, 128)

  const convertingsk = convertSpanKind(span.kind)
  if (convertingsk.error) return Result.error(convertingsk.error)
  const kind = convertingsk.value

  const convertingst = extractSpanType(attributes)
  if (convertingst.error) return Result.error(convertingst.error)
  const type = convertingst.value

  const specification = SPAN_SPECIFICATIONS[type]
  if (!specification) {
    return Result.error(new UnprocessableEntityError('Invalid span type'))
  }

  const convertingss = convertSpanStatus(span.status || { code: 0 })
  if (convertingss.error) return Result.error(convertingss.error)
  let status = convertingss.value

  let message = span.status?.message?.slice(0, 256)

  const convertingat = convertSpanTimestamp(span.startTimeUnixNano)
  if (convertingat.error) return Result.error(convertingat.error)
  const startedAt = convertingat.value

  const convertinget = convertSpanTimestamp(span.endTimeUnixNano)
  if (convertinget.error) return Result.error(convertinget.error)
  const endedAt = convertinget.value

  const duration = differenceInMilliseconds(endedAt, startedAt)
  if (duration < 0) {
    return Result.error(new UnprocessableEntityError('Invalid span duration'))
  }

  const convertingse = convertSpanEvents(span.events || [])
  if (convertingse.error) return Result.error(convertingse.error)
  const events = convertingse.value

  const convertingsl = convertSpanLinks(span.links || [])
  if (convertingsl.error) return Result.error(convertingsl.error)
  const links = convertingsl.value

  const extractingse = extractSpanError(attributes, events)
  if (extractingse.error) return Result.error(extractingse.error)
  if (extractingse.value != undefined) {
    status = SpanStatus.Error
    message = extractingse.value || undefined
  }

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

  const processing = await specification.process(
    { attributes, status, scope, apiKey, workspace },
    db,
  )
  if (processing.error) return Result.error(processing.error)
  metadata = { ...metadata, ...processing.value }

  return await Transaction.call(async (tx) => {
    const saving = await saveMetadata({ metadata, workspace }, disk)
    if (saving.error) return Result.error(saving.error)

    const span = (await tx
      .insert(spans)
      .values({
        id: id,
        traceId: traceId,
        segmentId: segmentId,
        parentId: parentId,
        workspaceId: workspace.id,
        apiKeyId: apiKey.id,
        name: name,
        kind: kind,
        type: type,
        status: status,
        message: message,
        duration: duration,
        startedAt: startedAt,
        endedAt: endedAt,
      })
      .returning()
      .then((r) => r[0]!)) as Span

    await publisher.publishLater({
      type: 'spanCreated',
      data: {
        span: span,
        apiKeyId: apiKey.id,
        workspaceId: workspace.id,
      },
    })

    const segment = segments.pop()
    if (segment) {
      const payload = {
        segment: segment,
        chain: segments,
        childId: span.id,
        childType: 'span' as const,
        traceId: traceId,
        apiKeyId: apiKey.id,
        workspaceId: workspace.id,
      }

      await tracingQueue.add('processSegmentJob', payload, {
        attempts: TRACING_JOBS_MAX_ATTEMPTS,
        deduplication: {
          id: processSegmentJobKey(payload, { ...span, metadata }),
        },
      })
    }

    return Result.ok({ span: { ...span, metadata } })
  }, db)
}

async function getExisting(
  {
    span: { spanId, traceId },
    workspace,
  }: {
    span: Otlp.Span
    workspace: Workspace
  },
  db: Database = database,
): Promise<TypedResult<SpanWithDetails | undefined>> {
  const spansRepository = new SpansRepository(workspace.id, db)
  const finding = await spansRepository.get({ spanId, traceId })
  if (finding.error) return Result.error(finding.error)

  const span = finding.value
  if (!span) return Result.nil()

  const metadatasRepository = new SpanMetadatasRepository(workspace.id)
  const getting = await metadatasRepository.get({ spanId, traceId, fresh: true }) // prettier-ignore
  if (getting.error) return Result.error(getting.error)

  const metadata = getting.value

  return Result.ok({ ...span, metadata } as SpanWithDetails)
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
    if (converting.error) return Result.error(converting.error)
    result[attribute.key] = converting.value
  }

  return Result.ok(result)
}

function extractSegmentsBaggage(
  attributes: Record<string, SpanAttribute>,
): TypedResult<SegmentBaggage[]> {
  const attribute = String(attributes[ATTR_LATITUDE_SEGMENTS] ?? '')
  if (!attribute) return Result.ok([])

  try {
    const payload = JSON.parse(attribute)
    const baggage = z.array(segmentBaggageSchema).parse(payload)

    return Result.ok(baggage)
  } catch (error) {
    return Result.error(
      new UnprocessableEntityError('Invalid segments baggage'),
    )
  }
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
    case SpanType.Segment:
      return Result.ok(SpanType.Segment)
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

async function saveMetadata(
  {
    metadata,
    workspace,
  }: {
    metadata: SpanMetadata
    workspace: Workspace
  },
  disk: DiskWrapper,
): Promise<TypedResult> {
  const key = SPAN_METADATA_STORAGE_KEY(
    workspace.id,
    metadata.traceId,
    metadata.spanId,
  )
  const cache = await redis()

  try {
    const payload = JSON.stringify(metadata)
    await disk.put(key, payload).then((r) => r.unwrap())
    await cache.del(key)
  } catch (error) {
    return Result.error(error as Error)
  }

  return Result.nil()
}
