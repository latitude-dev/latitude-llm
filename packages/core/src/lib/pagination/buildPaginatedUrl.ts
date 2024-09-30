export type QueryParams = { [key: string]: string | string[] | undefined }

export function parseSearchParams(
  searchParams: QueryParams | string | undefined,
) {
  if (typeof searchParams === 'string') {
    const searchParamsInstance = new URLSearchParams(searchParams)
    return Object.fromEntries(searchParamsInstance)
  }

  return searchParams ?? {}
}

export function buildPaginatedUrl({
  baseUrl,
  page,
  pageSize,
  queryParams,
}: {
  baseUrl: string
  page: number
  pageSize: number
  queryParams?: QueryParams | string
}) {
  const queryString = new URLSearchParams({
    ...parseSearchParams(queryParams),
    page: String(page),
    pageSize: String(pageSize),
  }).toString()

  return `${baseUrl}?${queryString}`
}
