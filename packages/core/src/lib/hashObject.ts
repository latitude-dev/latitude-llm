import stringify from 'fast-json-stable-stringify'
import { hashContent } from './hashContent'

export function hashObject(object: Record<string, unknown>) {
  const hash = hashContent(stringify(object))
  const keys = Object.keys(object).sort()
  const keyhash = hashContent(stringify(keys))

  return { hash, keyhash }
}
