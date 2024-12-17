import { CompletedSearch } from '../types'
import { SEARCH_COLUMNS } from './constants'

export const filterByInput = <T extends { label: string }>(
  items: T[],
  input: string,
): T[] => {
  if (!input) return items.sort((a, b) => a.label.localeCompare(b.label))

  return items
    .filter((item) => item.label.toLowerCase().includes(input.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export const initializeSearches = (
  searchParams: URLSearchParams,
): CompletedSearch[] => {
  const filtersParam = searchParams.get('filters')
  if (!filtersParam) return []

  try {
    const filters = JSON.parse(filtersParam)
    return filters
      .map((filter: any) => {
        const column = SEARCH_COLUMNS.find((col) => col.field === filter.field)
        if (!column) return null

        const operator = column.operators.find(
          (op) => op.value === filter.operator,
        )
        if (!operator) return null

        return { column, operator, value: filter.value }
      })
      .filter(Boolean)
  } catch (e) {
    return []
  }
}
