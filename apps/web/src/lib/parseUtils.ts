import { DEFAULT_PAGINATION_SIZE } from '@latitude-data/core/constants'
import { z } from 'zod'

export function parsePage(
  page: string | string[] | number | null | undefined,
): number {
  if (page === undefined || page === null) {
    return 1
  }

  if (Array.isArray(page)) {
    page = page[0]
  }

  const parsed = parseInt(String(page), 10)
  if (isNaN(parsed)) {
    return 1
  }

  if (parsed < 1) {
    return 1
  }

  return parsed
}

export function parsePageSize(
  pageSize: string | string[] | number | null | undefined,
): number {
  if (pageSize === undefined || pageSize === null) {
    return DEFAULT_PAGINATION_SIZE
  }

  if (Array.isArray(pageSize)) {
    pageSize = pageSize[0]
  }

  const parsed = parseInt(String(pageSize), 10)
  if (isNaN(parsed)) {
    return DEFAULT_PAGINATION_SIZE
  }

  if (parsed < 1) {
    return DEFAULT_PAGINATION_SIZE
  }

  return parsed
}

export function parseUuid(
  uuid: string | string[] | number | null | undefined,
): string | undefined {
  if (uuid === undefined || uuid === null) {
    return undefined
  }

  if (Array.isArray(uuid)) {
    uuid = uuid[0]
  }

  const parsed = z.uuid().safeParse(String(uuid))
  if (!parsed.success) {
    return undefined
  }

  return parsed.data
}
