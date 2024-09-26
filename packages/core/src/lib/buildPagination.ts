import { isNumber } from 'lodash-es'

type ItemType = 'page' | 'ellipsis'
type PageItem<T extends ItemType> = T extends 'page'
  ? { type: T; value: number; url: string }
  : { type: T; value: '...' }
export type IPagination = {
  count: number
  totalPages: number
  currentPage: number
  prevPage?: PageItem<'page'>
  pageItems: (PageItem<'page'> | PageItem<'ellipsis'>)[]
  nextPage?: PageItem<'page'>
}

function buildUrl({
  baseUrl,
  page,
  limit,
}: {
  baseUrl: string
  page: number
  limit: number
}) {
  return `${baseUrl}?page=${page}&limit=${limit}`
}

export function buildPagination({
  baseUrl,
  count,
  page,
  pageSize,
  pageItemsCount = 10,
}: {
  baseUrl: string
  count: number
  page: number
  pageSize: number
  pageItemsCount?: number
}) {
  const totalPages = Math.ceil(count / pageSize)
  const pagination: IPagination = {
    count,
    totalPages,
    currentPage: page,
    prevPage:
      page > 1
        ? {
            type: 'page',
            value: page - 1,
            url: buildUrl({ baseUrl, page: page - 1, limit: pageSize }),
          }
        : undefined,
    pageItems: [],
    nextPage:
      page < totalPages
        ? {
            type: 'page',
            value: page + 1,
            url: buildUrl({ baseUrl, page: page + 1, limit: pageSize }),
          }
        : undefined,
  }

  for (let i = page - 1; i >= 1 && pagination.pageItems.length < 2; i--) {
    pagination.pageItems.unshift({
      type: 'page',
      url: buildUrl({ baseUrl, page: i, limit: pageSize }),
      value: i,
    })
  }

  const prevItem = pagination.pageItems[0]
  const prevPage = isNumber(prevItem?.value) ? prevItem.value : undefined
  if (pagination.pageItems.length > 0 && prevPage && prevPage < page - 2) {
    pagination.pageItems.push({ type: 'ellipsis', value: '...' })
  }

  pagination.pageItems.push({
    type: 'page',
    value: page,
    url: buildUrl({ baseUrl, page, limit: pageSize }),
  })

  for (
    let i = page + 1;
    i <= totalPages && pagination.pageItems.length < pageItemsCount;
    i++
  ) {
    pagination.pageItems.push({
      type: 'page',
      value: i,
      url: buildUrl({ baseUrl, page: i, limit: pageSize }),
    })
  }

  const nextItem = pagination.pageItems[pagination.pageItems.length - 1]
  const nextPage = isNumber(nextItem?.value) ? nextItem.value : undefined
  if (pagination.pageItems.length > 0 && nextPage && nextPage > page + 1) {
    pagination.pageItems.push({ type: 'ellipsis', value: '...' })
  }

  return pagination
}

export function parsePage(
  page: string | string[] | number | undefined,
): number {
  return typeof page === 'string' ? Number(page) : 1
}
