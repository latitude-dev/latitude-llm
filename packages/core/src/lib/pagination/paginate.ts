import { sql } from 'drizzle-orm'
import type { PgSelect } from 'drizzle-orm/pg-core'

import { QueryParams } from './buildPaginatedUrl'
import {
  buildPagination,
  getPaginationParamsWithDefaults,
  PaginationArgs,
} from './buildPagination'

/**
 * This use $dynamic() query
 * https://orm.drizzle.team/docs/dynamic-query-building
 */
async function paginateQuerySql<T extends PgSelect>({
  dynamicQuery,
  page = 1,
  pageSize = 20,
}: {
  dynamicQuery: T
} & PaginationArgs) {
  // @ts-ignore
  dynamicQuery.config.fields = {
    // @ts-ignore
    ...dynamicQuery.config.fields,
    __count: sql<number>`count(*) over()`,
  }
  const rows = await dynamicQuery.limit(pageSize).offset((page - 1) * pageSize)
  const count = rows[0]?.__count ? Number(rows[0]?.__count) : 0
  return { rows, count }
}

export async function paginateQuery<T extends PgSelect>({
  dynamicQuery,
  pageUrl,
  searchParams,
  defaultPaginate,
}: {
  /**
   * IMPORTANT:
   * You need to use $dynamic() in your query
   * Example: `yourQuery.$dynamic()`
   */
  dynamicQuery: T
  pageUrl?: { base?: string; queryParams?: Record<string, unknown> }
  searchParams?: QueryParams | string
  defaultPaginate?: Exclude<PaginationArgs, 'page'>
}) {
  const { page, pageSize } = getPaginationParamsWithDefaults({
    defaultPaginate,
    searchParams,
  })
  const { rows, count } = await paginateQuerySql({
    dynamicQuery,
    page,
    pageSize,
  })
  const pagination = buildPagination({
    baseUrl: pageUrl?.base ?? '',
    count,
    queryParams: searchParams,
    encodeQueryParams: false,
    page,
    pageSize,
  })

  return { rows, pagination }
}
