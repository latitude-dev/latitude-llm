import { formatISO } from 'date-fns'
import {
  DocumentLogFilterOptions,
  LOG_FILTERS_ENCODED_PARAMS,
} from '../../../constants'
import { paramsToString } from '../../../lib/pagination/buildPaginatedUrl'

type CreatedAt = DocumentLogFilterOptions['createdAt']
export function formatDocumentLogCreatedAtParam(value: CreatedAt) {
  try {
    const from = value?.from
    const to = value?.to
    const fromStr = from ? formatISO(from) : undefined
    const toStr = to ? formatISO(to) : undefined

    if (!fromStr) return undefined

    const dateParts = [fromStr]

    if (toStr) dateParts.push(toStr)

    const key = 'createdAt'
    const formattedValue = dateParts.join(',')
    return {
      key,
      formattedValue,
      urlParam: `${key}=${formattedValue}`,
    }
  } catch (e) {
    if (e instanceof RangeError) {
      return undefined
    }
    throw e
  }
}

function processFilterOptions(filterOptions: DocumentLogFilterOptions) {
  return paramsToString({
    params: {
      ...filterOptions,
      createdAt: formatDocumentLogCreatedAtParam(filterOptions.createdAt),
    },
    paramsToEncode: LOG_FILTERS_ENCODED_PARAMS,
  })
}

export function generateDocumentLogsApiRouteWithParams({
  path,
  params,
  paramsToEncode: _pe = LOG_FILTERS_ENCODED_PARAMS,
}: {
  path: string
  paramsToEncode?: string[]
  params: {
    filterOptions?: DocumentLogFilterOptions
    page?: number
    pageSize?: number
    excludeErrors?: boolean
    days?: number | undefined
  }
}) {
  const { filterOptions, ...rest } = params

  let query = paramsToString({
    params: rest,
    paramsToEncode: _pe,
  })

  if (filterOptions) {
    query += `&${processFilterOptions(filterOptions)}`
  }

  if (!query) return path

  return `${path}?${query}`
}
