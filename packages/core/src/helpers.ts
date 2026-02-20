import {
  buildResponseMessage,
  ChainStepResponse,
  StreamType,
} from '@latitude-data/constants'
import type { Message } from '@latitude-data/constants/messages'
import { env } from '@latitude-data/env'
import type { ConfigurableProp, ConfigurePropOptions } from '@pipedream/sdk'
import { parseISO } from 'date-fns'
import {
  DEFAULT_PAGINATION_SIZE,
  type CsvData,
  type DateRange,
} from './constants'
import type { QueryParams } from './lib/pagination'

export function buildCsvFile(csvData: CsvData, name: string): File {
  const headers = csvData.headers.map((h) => JSON.stringify(h)).join(',')
  const rows = csvData.data.map((row) => Object.values(row.record).join(','))
  const csv = [headers, ...rows].join('\n')
  return new File([csv], `${name}.csv`, { type: 'text/csv' })
}

export function gatewayPath(pathname: string) {
  const protocol = env.GATEWAY_SSL ? 'https' : 'http'
  const port = env.GATEWAY_PORT ? `:${env.GATEWAY_PORT}` : ''
  const hostname = env.GATEWAY_HOSTNAME

  const pathnameWithLeadingSlash = pathname.startsWith('/')
    ? pathname
    : `/${pathname}`

  return `${protocol}://${hostname}${port}${pathnameWithLeadingSlash}`
}

export function buildMessagesFromResponse<T extends StreamType>({
  response,
}: {
  response: ChainStepResponse<T>
}) {
  const type = response.streamType
  const message =
    type === 'object'
      ? buildResponseMessage<'object'>({
          type: 'object',
          data: {
            object: response.object,
            text: response.text,
          },
        })
      : type === 'text'
        ? buildResponseMessage<'text'>({
            type: 'text',
            data: {
              text: response.text,
              reasoning: response.reasoning,
              toolCalls: response.toolCalls ?? undefined,
            },
          })
        : undefined

  return message ? ([message] as Message[]) : []
}

export function buildAllMessagesFromResponse<T extends StreamType>({
  response,
}: {
  response: ChainStepResponse<T>
}) {
  const previousMessages = response.input
  const messages = buildMessagesFromResponse({ response })

  return [...previousMessages, ...messages]
}

export function formatMessage(message: Message) {
  let result = ''

  if (typeof message.content === 'string') {
    result = message.content
  } else {
    result = message.content
      .map((content) => {
        switch (content.type) {
          case 'text':
            return content.text
          case 'reasoning':
            return content.text ?? 'Thought in private...'
          case 'redacted-reasoning':
            return content.data ?? 'Thought in private...'
          case 'image':
            if (typeof content.image === 'string') {
              try {
                return new URL(content.image).toString()
              } catch {
                return '[IMAGE]'
              }
            }
            return '[IMAGE]'
          case 'file':
            if (typeof content.file === 'string') {
              try {
                return new URL(content.file).toString()
              } catch {
                return '[FILE]'
              }
            }
            return '[FILE]'
          case 'tool-call':
            try {
              return JSON.stringify(content)
            } catch {
              return '[TOOL CALL]'
            }
          case 'tool-result':
            try {
              return JSON.stringify(content)
            } catch {
              return '[TOOL RESULT]'
            }
        }
      })
      .join('\n')
  }

  result = result.trim()

  return result
}

export function formatConversation(conversation: Message[]) {
  let result = ''

  for (const message of conversation) {
    if (!message) continue
    const speaker = message.role.charAt(0).toUpperCase() + message.role.slice(1)
    result += `${speaker}: ${formatMessage(message)}\n\n`
  }

  result = result.trim()

  return result
}

export type EvaluationResultsV2Search = {
  filters?: {
    commitUuids?: string[]
    experimentIds?: number[]
    errored?: boolean
    createdAt?: DateRange
  }
  orders?: {
    recency?: 'asc' | 'desc'
  }
  pagination: {
    page: number
    pageSize: number
    resultId?: number
  }
}

export function evaluationResultsV2SearchFromQueryParams(params: QueryParams) {
  const search = {
    filters: {},
    orders: {
      recency: 'desc',
    },
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGINATION_SIZE,
    },
  } as EvaluationResultsV2Search

  if (
    params.commitUuids !== undefined &&
    typeof params.commitUuids === 'string'
  ) {
    search.filters!.commitUuids = [
      ...new Set(params.commitUuids.split(',')),
    ].filter(Boolean)
  }

  if (
    params.experimentIds !== undefined &&
    typeof params.experimentIds === 'string'
  ) {
    search.filters!.experimentIds = [
      ...new Set(params.experimentIds.split(',')),
    ]
      .filter(Boolean)
      .map(Number)
  }

  if (params.errored !== undefined && typeof params.errored === 'string') {
    search.filters!.errored = params.errored === 'true'
  }

  if (params.fromCreatedAt && typeof params.fromCreatedAt === 'string') {
    search.filters!.createdAt = {
      ...(search.filters!.createdAt ?? {}),
      from: parseISO(params.fromCreatedAt),
    }
  }

  if (params.toCreatedAt && typeof params.toCreatedAt === 'string') {
    search.filters!.createdAt = {
      ...(search.filters!.createdAt ?? {}),
      to: parseISO(params.toCreatedAt),
    }
  }

  if (params.recency && params.recency === 'asc') {
    search.orders!.recency = 'asc'
  }

  if (params.recency && params.recency === 'desc') {
    search.orders!.recency = 'desc'
  }

  if (params.page && typeof params.page === 'string') {
    search.pagination.page = Number(params.page)
  }

  if (params.pageSize && typeof params.pageSize === 'string') {
    search.pagination.pageSize = Number(params.pageSize)
  }

  if (params.resultId && typeof params.resultId === 'string') {
    search.pagination.resultId = Number(params.resultId)
  }

  return search
}

export function evaluationResultsV2SearchToQueryParams(
  search: EvaluationResultsV2Search,
) {
  const params = new URLSearchParams()

  if (search.filters?.commitUuids !== undefined) {
    const commitUuids = [...new Set(search.filters.commitUuids)].filter(Boolean)
    params.set('commitUuids', commitUuids.join(','))
  }

  if (search.filters?.experimentIds !== undefined) {
    const experimentIds = [...new Set(search.filters.experimentIds)].filter(
      Boolean,
    )
    params.set('experimentIds', experimentIds.join(','))
  }

  if (search.filters?.errored !== undefined) {
    params.set('errored', search.filters.errored.toString())
  }

  if (search.filters?.createdAt?.from) {
    params.set('fromCreatedAt', search.filters.createdAt.from.toISOString())
  }

  if (search.filters?.createdAt?.to) {
    params.set('toCreatedAt', search.filters.createdAt.to.toISOString())
  }

  if (search.orders?.recency === 'asc') {
    params.set('recency', 'asc')
  }

  if (search.orders?.recency === 'desc') {
    params.set('recency', 'desc')
  }

  params.set('page', String(search.pagination.page))
  params.set('pageSize', String(search.pagination.pageSize))

  if (search.pagination.resultId !== undefined) {
    params.set('resultId', String(search.pagination.resultId))
  }

  return params.toString()
}

export function getPropOptions<T = string>(
  prop: ConfigurableProp,
): Record<string, T> | undefined {
  if (!('options' in prop)) return undefined
  const options = prop.options as ConfigurePropOptions | string[]
  if (!options) return undefined

  return Object.fromEntries(
    options.map((option) => {
      if (typeof option === 'string') {
        return [option, option] as [string, T]
      }

      const { label, value } = 'lv' in option ? option.lv : option
      return [label, value ?? label] as [string, T]
    }),
  )
}

export type Pagination = {
  page?: number
  pageSize?: number
}
