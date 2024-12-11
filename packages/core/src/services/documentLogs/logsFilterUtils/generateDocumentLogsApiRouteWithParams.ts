import { formatISO } from 'date-fns'
import {
  DocumentLogFilterOptions,
  LOG_FILTERS_ENCODED_PARAMS,
} from '../../../constants'

function addToAcc(acc: string[], key: string, value: unknown) {
  if (!value) return acc
  if (Array.isArray(value) && !value.length) return acc

  acc.push(`${key}=${value}`)
  return acc
}

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
  return Object.keys(filterOptions).reduce((acc, key) => {
    switch (key) {
      case 'createdAt': {
        const createdAt = formatDocumentLogCreatedAtParam(
          filterOptions.createdAt,
        )
        if (!createdAt) return acc

        acc.push(createdAt.urlParam)
        return acc
      }
      default: {
        return addToAcc(
          acc,
          key,
          filterOptions[key as keyof DocumentLogFilterOptions],
        )
      }
    }
  }, [] as string[])
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
  const parts = Object.keys(params).reduce((acc, key) => {
    switch (key) {
      case 'filterOptions': {
        const filterParts = processFilterOptions(
          params[key] as DocumentLogFilterOptions,
        )
        acc.push(...filterParts)
        return acc
      }
      default: {
        return addToAcc(acc, key, params[key as keyof typeof params])
      }
    }
  }, [] as string[])

  if (!parts.length) return path

  return `${path}?${parts.join('&')}`
}
