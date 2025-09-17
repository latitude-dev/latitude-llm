import type { PageInfo } from '@pipedream/sdk'

// Pipedream sucks - the Page type is returned from several methods in the SDK but its type is not exposed for some reason, so I have to define it myself
export type Page<T> = {
  data: T[]
  getNextPage: () => Promise<Page<T>>
  hasNextPage: () => boolean
  [Symbol.asyncIterator]: () => AsyncIterator<T, void, any>
}

export function getPageInfo<T>(page: Page<T>): PageInfo {
  // @ts-expect-error - Pipedream sucks - the pageInfo is included in the response but not public for some reason
  return page.response.pageInfo
}
