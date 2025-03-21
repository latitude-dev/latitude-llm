import { DEFAULT_PAGINATION_SIZE } from '../../constants'
import {
  buildPaginatedUrl,
  parseSearchParams,
  QueryParams,
} from './buildPaginatedUrl'

export type PaginationArgs = {
  page?: number
  pageSize?: number
}

function parsePage(page: string | string[] | number | undefined): number {
  return typeof page === 'string' ? Number(page) : 1
}

export type IPagination = ReturnType<typeof buildPagination>

export function getPaginationParamsWithDefaults({
  defaultPaginate,
  searchParams,
}: {
  defaultPaginate?: Exclude<PaginationArgs, 'page'>
  searchParams?: QueryParams | string
}) {
  const params = parseSearchParams({
    queryParams: searchParams,
    encodeQueryParams: false,
  })
  return {
    page: parsePage(params?.page),
    pageSize: params?.pageSize
      ? Number(params.pageSize)
      : (defaultPaginate?.pageSize ?? DEFAULT_PAGINATION_SIZE),
  }
}

/**
 * When count is `Infinity` we assume that there are more pages to come.
 * and we don't know the total number of pages.
 * and we display just `< prev` and `next >` buttons.
 */
export function buildPagination({
  baseUrl,
  count,
  queryParams,
  page,
  pageSize,
  encodeQueryParams = true,
  paramsToEncode = [],
}: {
  baseUrl: string
  count: number | typeof Infinity
  queryParams?: QueryParams | string | undefined
  encodeQueryParams?: boolean
  paramsToEncode?: string[]
  page: number
  pageSize: number
}) {
  const totalPages = Math.ceil(count / pageSize)
  return {
    page,
    baseUrl,
    pageSize,
    count,
    totalPages,
    prevPage:
      page > 1
        ? {
            value: page - 1,
            url: buildPaginatedUrl({
              baseUrl,
              page: page - 1,
              pageSize,
              queryParams,
              encodeQueryParams,
              paramsToEncode,
            }),
          }
        : undefined,
    nextPage:
      page < totalPages || count === Infinity
        ? {
            value: page + 1,
            url: buildPaginatedUrl({
              baseUrl,
              page: page + 1,
              pageSize,
              queryParams,
              encodeQueryParams,
              paramsToEncode,
            }),
          }
        : undefined,
  }
}

export type ClientPagination = ReturnType<typeof buildPagination>
