import { database } from '../../../../client'
import { ATTRIBUTES, Otlp, SpanStatus, SpanType } from '../../../../constants'
import { Result } from '../../../../lib/Result'
import { type ApiKey } from '../../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { captureException } from '../../../../utils/datadogCapture'
import {
  convertSpanAttributes,
  convertSpanStatus,
  extractApiKeyAndWorkspace,
  extractSpanType,
} from './process'
import { processSpansBulk } from './processBulk'

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
) {
  const workspaces: Record<number, Workspace> = {}
  const apiKeys: Record<number, ApiKey> = {}
  const processedSpans: Array<{
    span: Otlp.Span
    scope: Otlp.Scope
    resource: Otlp.Resource
    apiKey: ApiKey
    workspace: Workspace
  }> = []

  // Process all spans and collect valid ones
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

        // Note: We no longer skip Unknown spans to preserve trace hierarchy
        // (e.g., DSPy CHAIN spans that parent LLM completion spans)
        const extractingApiKeyAndWorkspace = await extractApiKeyAndWorkspace(
          { apiKeyId, workspaceId, attributes },
          db,
        )
        if (extractingApiKeyAndWorkspace.error) {
          if (type !== SpanType.Unknown) {
            captureException(extractingApiKeyAndWorkspace.error)
          }
          continue
        }
        const { apiKey, workspace } = extractingApiKeyAndWorkspace.value

        // Cache the results to avoid repeated lookups
        workspaces[workspace.id] = workspace
        apiKeys[apiKey.id] = apiKey

        const enriching = enrichAttributes({ resource, scope, span })
        if (enriching.error) {
          if (type !== SpanType.Unknown) {
            captureException(enriching.error)
          }
          continue
        }
        span.attributes = enriching.value.filter(
          ({ key }) => key !== ATTRIBUTES.LATITUDE.internal,
        )

        processedSpans.push({ span, scope, resource, apiKey, workspace })
      }
    }
  }

  // If no valid spans, return early
  if (processedSpans.length === 0) {
    return Result.nil()
  }

  // Group spans by workspace and API key for efficient processing
  const spansByWorkspace = new Map<number, Map<number, typeof processedSpans>>()

  for (const processedSpan of processedSpans) {
    const { workspace, apiKey } = processedSpan
    if (!spansByWorkspace.has(workspace.id)) {
      spansByWorkspace.set(workspace.id, new Map())
    }
    const workspaceSpans = spansByWorkspace.get(workspace.id)!
    if (!workspaceSpans.has(apiKey.id)) {
      workspaceSpans.set(apiKey.id, [])
    }
    workspaceSpans.get(apiKey.id)!.push(processedSpan)
  }

  // Process spans in bulk for each workspace/apiKey combination
  for (const [workspaceId, apiKeySpans] of spansByWorkspace) {
    for (const [apiKeyId, spans] of apiKeySpans) {
      const apiKey = apiKeys[apiKeyId]!
      const workspace = workspaces[workspaceId]!

      const processing = await processSpansBulk({ spans, apiKey, workspace })
      if (processing.error) {
        captureException(processing.error)
        continue
      }
    }
  }

  return Result.nil()
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
    key: ATTRIBUTES.OPENTELEMETRY.OTEL.scope.name,
    value: { stringValue: scope.name },
  })

  if (scope.version) {
    attributes.push({
      key: ATTRIBUTES.OPENTELEMETRY.OTEL.scope.version,
      value: { stringValue: scope.version },
    })
  }

  const converting = convertSpanStatus(span.status || { code: 0 })
  const status = converting.value ?? SpanStatus.Unset
  attributes.push({
    key: ATTRIBUTES.OPENTELEMETRY.OTEL.status.code,
    value: { stringValue: status.toUpperCase() },
  })

  if (span.status?.message) {
    attributes.push({
      key: ATTRIBUTES.OPENTELEMETRY.OTEL.status.description,
      value: { stringValue: span.status.message },
    })
  }

  return Result.ok(attributes)
}
