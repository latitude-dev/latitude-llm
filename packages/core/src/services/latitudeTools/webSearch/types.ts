import type { TavilySearchResponse } from '@tavily/core'

export type SearchToolArgs = {
  query: string
  topic?: 'general' | 'news' | 'finance'
  days?: number
  maxResults?: number
}

export type SearchToolResult = TavilySearchResponse
