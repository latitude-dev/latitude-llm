import { Database } from '../../../client'
import {
  ATTRIBUTES,
  BaseSpanMetadata,
  Otlp,
  SpanAttribute,
  SpanMetadata,
  SpanReferenceMetadata,
  SpanSpecification,
  SpanStatus,
  SpanType,
} from '../../../constants'
import { TypedResult } from '../../../lib/Result'
import { type ApiKey } from '../../../schema/models/types/ApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'

export type SpanProcessArgs<T extends SpanType = SpanType> = {
  attributes: Record<string, SpanAttribute>
  status: SpanStatus
  scope: Otlp.Scope
  apiKey: ApiKey
  workspace: Workspace
  _type?: T // TODO(tracing): required for type inference, remove this when something in the specification uses the type
}

export type SpanBackendSpecification<T extends SpanType = SpanType> =
  SpanSpecification<T> & {
    process: (
      args: SpanProcessArgs<T>,
      db?: Database,
    ) => Promise<TypedResult<Omit<SpanMetadata<T>, keyof BaseSpanMetadata<T>>>>
  }

export function convertTimestamp(timestamp: string): Date {
  const nanoseconds = BigInt(timestamp)
  const milliseconds = Number(nanoseconds / 1_000_000n)
  return new Date(milliseconds)
}

function capitalize(str: string) {
  if (str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1)
}

type CamelCaseable = string | string[] | Record<string, unknown> // prettier-ignore
export function toCamelCase(value: string): string // prettier-ignore
export function toCamelCase(value: string[]): string[] // prettier-ignore
export function toCamelCase<V = unknown>(value: Record<string, V>): Record<string, V> // prettier-ignore
export function toCamelCase(value: CamelCaseable): CamelCaseable {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w, i) => (i ? capitalize(w) : w.toLowerCase()))
      .join('')
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCamelCase(item) as string)
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [toCamelCase(key), value]),
    )
  }

  return value
}

const DEPTH_LIMIT = 10
const SPARSE_LIMIT = 100

export function setField(object: any, path: string, value: any) {
  const parts = path.trim().split('.')
  if (parts.length > DEPTH_LIMIT) {
    throw new Error('Field path is too complex')
  }

  let current = object
  for (const [index, part] of parts.entries()) {
    const key = isNaN(Number(part)) ? part : Number(part)
    if (typeof key === 'number' && (key < 0 || key > SPARSE_LIMIT)) {
      throw new Error('Field path is too sparse')
    }

    if (index === parts.length - 1) current[key] = value
    else {
      if (!(key in current) || typeof current[key] !== 'object') {
        const nextPart = parts[index + 1]
        current[key] = !isNaN(Number(nextPart)) ? [] : {}
      }
      current = current[key]
    }
  }
}

export function validateUndefineds(object: any): boolean {
  if (object === undefined) return false
  if (object === null) return true
  if (Array.isArray(object)) return object.every(validateUndefineds)
  if (typeof object === 'object') {
    return Object.values(object).every(validateUndefineds)
  }

  return true
}

/**
 * Extracts Latitude reference attributes from raw span attributes.
 */
export function extractLatitudeReferences(
  attributes: Record<string, SpanAttribute>,
): SpanReferenceMetadata {
  const references: SpanReferenceMetadata = {}

  const source = attributes[ATTRIBUTES.LATITUDE.source]
  if (source)
    references.source = String(source) as SpanReferenceMetadata['source']

  const documentLogUuid = attributes[ATTRIBUTES.LATITUDE.documentLogUuid]
  if (documentLogUuid) references.documentLogUuid = String(documentLogUuid)

  const promptUuid = attributes[ATTRIBUTES.LATITUDE.documentUuid]
  if (promptUuid) references.promptUuid = String(promptUuid)

  const versionUuid = attributes[ATTRIBUTES.LATITUDE.commitUuid]
  if (versionUuid) references.versionUuid = String(versionUuid)

  const experimentUuid = attributes[ATTRIBUTES.LATITUDE.experimentUuid]
  if (experimentUuid) references.experimentUuid = String(experimentUuid)

  const projectId = Number(attributes[ATTRIBUTES.LATITUDE.projectId])
  if (Number.isFinite(projectId)) references.projectId = projectId

  const testDeploymentId = Number(
    attributes[ATTRIBUTES.LATITUDE.testDeploymentId],
  )
  if (Number.isFinite(testDeploymentId)) {
    references.testDeploymentId = testDeploymentId
  }

  const previousTraceId = attributes[ATTRIBUTES.LATITUDE.previousTraceId]
  if (previousTraceId) references.previousTraceId = String(previousTraceId)

  return references
}
