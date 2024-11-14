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
  const params = parseSearchParams(searchParams)
  return {
    page: parsePage(params?.page),
    pageSize: params?.pageSize
      ? Number(params.pageSize)
      : (defaultPaginate?.pageSize ?? DEFAULT_PAGINATION_SIZE),
  }
}

export function buildPagination({
  baseUrl,
  count,
  queryParams,
  page,
  pageSize,
}: {
  baseUrl: string
  count: number
  queryParams?: QueryParams | string | undefined
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
            }),
          }
        : undefined,
    nextPage:
      page < totalPages
        ? {
            value: page + 1,
            url: buildPaginatedUrl({
              baseUrl,
              page: page + 1,
              pageSize,
              queryParams,
            }),
          }
        : undefined,
  }
}
