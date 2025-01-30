export type QueryParams = { [key: string]: string | string[] | undefined }

export function paramsToString({
  params,
  paramsToEncode = [],
}: {
  params: Record<string, unknown> | QueryParams | undefined
  paramsToEncode?: string[]
}) {
  if (!params) return ''

  return Object.entries(params)
    .map(([key, value]) => {
      if (!value) return undefined
      if (Array.isArray(value) && !value.length) return undefined

      if (paramsToEncode.includes(key)) {
        return `${key}=${encodeURIComponent(value?.toString() ?? '')}`
      }
      return `${key}=${value?.toString() ?? ''}`
    })
    .filter(Boolean)
    .join('&')
}

function parseStringQueryParams(queryParams: string): QueryParams {
  const parts = queryParams.split('&')
  return parts.reduce((acc, part) => {
    const [key, value] = part.split('=')
    if (!key) return acc
    return { ...acc, [key]: value }
  }, {})
}

function parseEncodedQueryParams(queryParams: string): QueryParams {
  const searchParams = new URLSearchParams(queryParams)
  return Object.fromEntries(searchParams)
}

export function parseSearchParams({
  queryParams,
  encodeQueryParams,
  pageParams,
}: {
  queryParams: QueryParams | string | undefined
  encodeQueryParams: boolean
  pageParams?: { page: string; pageSize: string }
}) {
  if (typeof queryParams === 'string') {
    const parsed = encodeQueryParams
      ? parseEncodedQueryParams(queryParams)
      : parseStringQueryParams(queryParams)
    return parsed ? { ...parsed, ...pageParams } : (pageParams ?? {})
  }

  if (typeof queryParams === 'object') {
    return queryParams ? { ...queryParams, ...pageParams } : pageParams
  }

  return pageParams ?? {}
}

export function buildPaginatedUrl({
  baseUrl,
  page,
  pageSize,
  queryParams,
  encodeQueryParams = true,
  paramsToEncode = [],
}: {
  baseUrl: string
  page: number
  pageSize: number
  encodeQueryParams?: boolean
  queryParams?: QueryParams | string
  paramsToEncode?: string[]
}) {
  const params = parseSearchParams({
    queryParams,
    encodeQueryParams,
    pageParams: {
      page: String(page),
      pageSize: String(pageSize),
    },
  })

  return `${baseUrl}?${paramsToString({ params, paramsToEncode })}`
}
