import { env } from '@latitude-data/env'

/**
 * Creates a full link by prepending the APP_URL to the given path.
 */
export function createLink(path: string) {
  return `${env.APP_URL}/${path}`
}
