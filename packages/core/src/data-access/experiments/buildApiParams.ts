import { z } from 'zod'
import { formatISO } from 'date-fns'
import {
  LogSources,
} from '../../constants'
import { paramsToString } from '../../lib/pagination/buildPaginatedUrl'

const EXPERIMENTS_ENCODED_PARAMS = ['customIdentifier']

const experimentsFiltersSchema = z.object({
  commitIds: z.array(z.number()),
  logSources: z.array(z.enum(LogSources)),
  createdAt: z
    .object({ from: z.date().optional(), to: z.date().optional() })
    .optional(),
  customIdentifier: z.string().optional(),
  experimentId: z.number().optional(),
})

type ExperimentsFilters = z.infer<
  typeof experimentsFiltersSchema
>
type CreatedAt = ExperimentsFilters['createdAt']

function formatCreatedAtParam(value: CreatedAt) {
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

function processFilterOptions(filterOptions?: ExperimentsFilters) {
  if (!filterOptions) return undefined

  return paramsToString({
    params: {
      ...filterOptions,
      createdAt: formatCreatedAtParam(filterOptions.createdAt)
        ?.formattedValue,
    },
    paramsToEncode: EXPERIMENTS_ENCODED_PARAMS,
  })
}

export function buildExperimentsApiParams({
  path,
  params,
  paramsToEncode: _pe = EXPERIMENTS_ENCODED_PARAMS,
}: {
  path: string
  paramsToEncode?: string[]
  params: {
    filterOptions?: ExperimentsFilters
    page?: number
    pageSize?: number
    excludeErrors?: boolean
    commitUuid?: string
    days?: number | undefined
    from?: string | null
    configuration?: string
  }
}) {
  const { filterOptions, ...rest } = params

  let query = paramsToString({
    params: rest,
    paramsToEncode: _pe,
  })

  const filtersQuery = processFilterOptions(filterOptions)
  if (filtersQuery) {
    if (query) query += `&${filtersQuery}`
    else query = filtersQuery
  }

  if (!query) return path

  return `${path}?${query}`
}
