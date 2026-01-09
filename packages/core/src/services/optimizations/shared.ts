import { OptimizationConfiguration, Span, SpanType } from '../../constants'
import { hashContent } from '../../lib/hashContent'

export function hashSpan(span: Span<SpanType.Prompt>) {
  return `${span.traceId}:${span.id}`
}

export function hashParameters(parameters: Record<string, unknown>) {
  const keys = Object.keys(parameters).sort()
  const values = keys.map((key) => parameters[key])

  const keyhash = hashContent(JSON.stringify(keys))
  const valhash = hashContent(JSON.stringify(values))

  return { keyhash, valhash }
}

// BONUS(AO/OPT): Generate fake data for the parameter
export function maskParameter({
  parameter,
}: {
  parameter: string
  value: unknown
  configuration: OptimizationConfiguration
}) {
  return `{{${parameter}}} (REDACTED)`
}
