import {
  ATTR_OTEL_SCOPE_NAME,
  ATTR_OTEL_SCOPE_VERSION,
  ATTR_OTEL_STATUS_CODE,
  ATTR_OTEL_STATUS_DESCRIPTION,
} from '@opentelemetry/semantic-conventions'
import {
  ApiKey,
  ATTR_LATITUDE_INTERNAL,
  Otlp,
  SPAN_PROCESSING_STORAGE_KEY,
  SpanAttribute,
  SpanProcessingData,
  SpanStatus,
  SpanType,
  TRACING_JOBS_MAX_ATTEMPTS,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { unsafelyFindWorkspace } from '../../../data-access'
import { processSpanJobKey } from '../../../jobs/job-definitions/tracing/processSpanJob'
import { tracingQueue } from '../../../jobs/queues'
import { diskFactory, DiskWrapper } from '../../../lib/disk'
import { UnprocessableEntityError } from '../../../lib/errors'
import { hashContent as hash } from '../../../lib/hashContent'
import { Result } from '../../../lib/Result'
import { ApiKeysRepository } from '../../../repositories'
import { internalBaggageSchema } from '../../../telemetry'
import { captureException } from '../../../utils/workers/sentry'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'

// TODO(tracing): enhance this function
export async function ingestSpans(
  {
    spans,
    apiKeyId,
    workspaceId,
  }: {
    spans: Otlp.ResourceSpan[]
    apiKeyId?: number
    workspaceId?: number
  },
  db = database,
  disk: DiskWrapper = diskFactory('private'),
) {
  const workspaces: Record<number, Workspace> = {}
  const apiKeys: Record<number, ApiKey> = {}

  for (const { resource, scopeSpans } of spans) {
    for (const { scope, spans } of scopeSpans) {
      for (const span of spans) {
        const converting = convertSpanAttributes(span.attributes || [])
        if (converting.error) {
          captureException(converting.error)
          continue
        }
        const attributes = converting.value

        const extracting = extractSpanType(attributes)
        if (extracting.error) {
          captureException(extracting.error)
          continue
        }
        const type = extracting.value
        if (type === SpanType.Unknown) continue

        let internal
        if (!workspaceId) {
          const extracting = extractInternal(attributes)
          if (extracting.error) {
            captureException(extracting.error)
            continue
          }
          internal = extracting.value
        }

        let workspace = workspaces[workspaceId ?? internal?.workspaceId ?? -1]
        if (!workspace) {
          const getting = await getWorkspace(
            { workspaceId: workspaceId ?? internal?.workspaceId },
            db,
          )
          if (getting.error) {
            captureException(getting.error)
            continue
          }

          workspace = getting.value
          workspaces[workspace.id] = workspace
        }

        let apiKey = apiKeys[apiKeyId ?? internal?.apiKeyId ?? -1]
        if (!apiKey) {
          const getting = await getApiKey(
            { apiKeyId: apiKeyId ?? internal?.apiKeyId, workspace },
            db,
          )
          if (getting.error) {
            captureException(getting.error)
            continue
          }

          apiKey = getting.value
          apiKeys[apiKey.id] = apiKey
        }

        const enriching = enrichAttributes({ resource, scope, span })
        if (enriching.error) {
          captureException(enriching.error)
          continue
        }
        span.attributes = enriching.value.filter(
          ({ key }) => key !== ATTR_LATITUDE_INTERNAL,
        )

        const enqueuing = await enqueueSpan(
          { span, scope, resource, apiKey, workspace },
          disk,
        )
        if (enqueuing.error) {
          captureException(enqueuing.error)
          continue
        }
      }
    }
  }

  return Result.nil()
}

function extractInternal(attributes: Record<string, SpanAttribute>) {
  const attribute = String(attributes[ATTR_LATITUDE_INTERNAL] ?? '')
  if (!attribute) {
    return Result.error(
      new UnprocessableEntityError('Internal baggage is required'),
    )
  }

  try {
    const payload = JSON.parse(attribute)
    const baggage = internalBaggageSchema.parse(payload)

    return Result.ok(baggage)
  } catch (error) {
    return Result.error(
      new UnprocessableEntityError('Invalid internal baggage'),
    )
  }
}

async function getWorkspace(
  {
    workspaceId,
  }: {
    workspaceId?: number
  },
  db = database,
) {
  if (!workspaceId) {
    return Result.error(new UnprocessableEntityError('Workspace is required'))
  }

  const workspace = await unsafelyFindWorkspace(workspaceId, db)
  if (!workspace) {
    return Result.error(new UnprocessableEntityError('Workspace not found'))
  }

  return Result.ok(workspace)
}

async function getApiKey(
  {
    apiKeyId,
    workspace,
  }: {
    apiKeyId?: number
    workspace: Workspace
  },
  db = database,
) {
  const repository = new ApiKeysRepository(workspace.id, db)

  let apiKey
  if (apiKeyId) {
    const finding = await repository.find(apiKeyId)
    if (finding.error) {
      return Result.error(new UnprocessableEntityError('API key not found'))
    }
    apiKey = finding.value
  } else {
    const finding = await repository.selectFirst()
    if (finding.error) {
      return Result.error(new UnprocessableEntityError('API key not found'))
    }
    apiKey = finding.value
  }

  if (!apiKey) {
    return Result.error(new UnprocessableEntityError('API key is required'))
  }

  return Result.ok(apiKey)
}

function enrichAttributes({
  resource,
  scope,
  span,
}: {
  resource: Otlp.Resource
  scope: Otlp.Scope
  span: Otlp.Span
}) {
  const attributes: Otlp.Attribute[] = []

  attributes.push(...(resource.attributes || []))

  attributes.push(...(span.attributes || []))

  attributes.push({
    key: ATTR_OTEL_SCOPE_NAME,
    value: { stringValue: scope.name },
  })

  if (scope.version) {
    attributes.push({
      key: ATTR_OTEL_SCOPE_VERSION,
      value: { stringValue: scope.version },
    })
  }

  const converting = convertSpanStatus(span.status || { code: 0 })
  const status = converting.value ?? SpanStatus.Unset
  attributes.push({
    key: ATTR_OTEL_STATUS_CODE,
    value: { stringValue: status.toUpperCase() },
  })

  if (span.status?.message) {
    attributes.push({
      key: ATTR_OTEL_STATUS_DESCRIPTION,
      value: { stringValue: span.status.message },
    })
  }

  return Result.ok(attributes)
}

async function enqueueSpan(
  {
    span,
    scope,
    resource,
    apiKey,
    workspace,
  }: {
    span: Otlp.Span
    scope: Otlp.Scope
    resource: Otlp.Resource
    apiKey: ApiKey
    workspace: Workspace
  },
  disk: DiskWrapper,
) {
  const processingId = hash(span.traceId + span.spanId)
  const key = SPAN_PROCESSING_STORAGE_KEY(processingId)
  const data = { span, scope, resource } satisfies SpanProcessingData

  try {
    const payload = JSON.stringify(data)
    await disk.put(key, payload).then((r) => r.unwrap())
  } catch (error) {
    return Result.error(error as Error)
  }

  const payload = {
    processingId: processingId,
    apiKeyId: apiKey.id,
    workspaceId: workspace.id,
  }

  await tracingQueue.add('processSpanJob', payload, {
    attempts: TRACING_JOBS_MAX_ATTEMPTS,
    deduplication: { id: processSpanJobKey(payload) },
  })

  return Result.nil()
}
