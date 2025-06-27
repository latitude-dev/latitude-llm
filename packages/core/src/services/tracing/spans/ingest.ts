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
  SpanType,
  Workspace,
} from '../../../browser'
import { database, Database } from '../../../client'
import { unsafelyFindWorkspace } from '../../../data-access'
import { processSpanJobKey } from '../../../jobs/job-definitions/tracing/processSpanJob'
import { tracingQueue } from '../../../jobs/queues'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { ApiKeysRepository } from '../../../repositories'
import { internalBaggageSchema } from '../../../telemetry'
import { captureException } from '../../../utils/workers/sentry'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractSpanType,
} from './process'

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
  db: Database = database,
) {
  const workspaces: Record<number, Workspace> = {}
  const apiKeys: Record<number, ApiKey> = {}

  for (const { resource, scopeSpans } of spans) {
    for (const { scope, spans } of scopeSpans) {
      for (const span of spans) {
        const attributes = convertSpanAttributes(span.attributes || [])

        const type = extractSpanType(attributes)
        if (type === SpanType.Unknown) continue

        let internal
        if (!workspaceId) {
          const baggage = attributes[ATTR_LATITUDE_INTERNAL]
          if (!baggage) {
            captureException(
              new UnprocessableEntityError('Internal baggage is required'),
            )
            continue
          }

          const parsing = internalBaggageSchema.safeParse(baggage)
          if (parsing.error) {
            captureException(parsing.error)
            continue
          }

          internal = parsing.data
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

        span.attributes = enrichAttributes({ resource, scope, span })
        span.attributes = span.attributes.filter(
          ({ key }) => key !== ATTR_LATITUDE_INTERNAL,
        )

        const payload = {
          span: span,
          scope: scope,
          apiKeyId: apiKey.id,
          workspaceId: workspace.id,
        }

        await tracingQueue.add('processSpanJob', payload, {
          deduplication: { id: processSpanJobKey(payload) },
        })
      }
    }
  }

  return Result.nil()
}

async function getWorkspace(
  {
    workspaceId,
  }: {
    workspaceId?: number
  },
  db: Database = database,
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
  db: Database = database,
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
  if (span.status && span.status?.code !== Otlp.StatusCode.Unset) {
    const status = convertSpanStatus(span.status)
    attributes.push({
      key: ATTR_OTEL_STATUS_CODE,
      value: { stringValue: status.toUpperCase() },
    })
  }
  if (span.status?.message) {
    attributes.push({
      key: ATTR_OTEL_STATUS_DESCRIPTION,
      value: { stringValue: span.status.message },
    })
  }

  return attributes
}
