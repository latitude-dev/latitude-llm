import { format, isValid, parseISO } from 'date-fns'

import type { DatasetRow, DatasetV2 } from '@latitude-data/core/browser'
import {
  DatasetRowData,
  type DatasetRowDataContent,
} from '@latitude-data/core/schema'

export type ClientDatasetRow = DatasetRow & {
  cells: DatasetRowData[keyof DatasetRowData][]
  processedRowData: { [key: string]: string }
}
function formatMaybeIsoDate(value: string): string | null {
  if (typeof value !== 'string') return null

  try {
    const date = parseISO(value)
    if (!isValid(date)) return null

    // If there's time info, include it
    if (value.includes('T') && !value.endsWith('T00:00:00.000Z')) {
      return format(date, 'dd MMM yyyy, HH:mm')
    }

    return format(date, 'dd MMM yyyy')
  } catch {
    return null
  }
}

export function serializeRow({
  row,
  columns,
}: {
  row: DatasetRow
  columns: DatasetV2['columns']
}): ClientDatasetRow {
  return {
    ...row,
    // DEPRECATED: We don't need this. Remove once
    // DataGrid is used without feature flag.
    cells: columns.map(({ identifier }) => {
      const cell = row.rowData[identifier]
      return parseRowCell({ cell, parseDates: true })
    }),
    processedRowData: Object.keys(row.rowData).reduce(
      (acc, key) => {
        const rawCell = row.rowData[key]
        const cell = parseRowCell({ cell: rawCell, parseDates: true })
        return { ...acc, [key]: cell }
      },
      {} as ClientDatasetRow['processedRowData'],
    ),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export const serializeRows =
  (columns: DatasetV2['columns']) =>
    (rows: DatasetRow[]): ClientDatasetRow[] => {
      return rows.map((item) => serializeRow({ row: item, columns }))
    }

export function parseRowCell({
  cell,
  parseDates,
}: {
  cell: DatasetRowDataContent
  parseDates: boolean
}) {
  if (cell === null || cell === undefined) {
    return ''
  }

  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    if (typeof cell === 'string' && parseDates) {
      const formattedDate = formatMaybeIsoDate(cell)
      if (formattedDate) return formattedDate
    }
    return String(cell)
  }

  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell)
    } catch {
      return String(cell)
    }
  }

  return String(cell)
}

function tryParseFormattedDate(value: string): Date | null {
  const formats = ['dd MMM yyyy, HH:mm', 'dd MMM yyyy']
  for (const fmt of formats) {
    const parsed = parseISO(formatMaybeIsoDate(value) ?? '') // naive check
    if (isValid(parsed)) return parsed
  }
  return null
}

function deserializeCell(value: string): DatasetRowDataContent {
  if (value === '') return null

  // Try to parse JSON objects
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
  } catch {
    // not JSON
  }

  // Try to parse booleans
  if (value === 'true') return true
  if (value === 'false') return false

  // Try to parse numbers
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') {
    return num
  }

  // Try to parse back to ISO string if it looks like a formatted date
  const maybeDate = tryParseFormattedDate(value)
  if (maybeDate) return maybeDate.toISOString()

  return value
}

export function deserializeRow({ row }: { row: ClientDatasetRow }): DatasetRow {
  const parsedRowData: DatasetRowData = Object.fromEntries(
    Object.entries(row.processedRowData).map(([key, value]) => {
      return [key, deserializeCell(value)]
    }),
  )

  return {
    ...row,
    rowData: parsedRowData,
  }
}
