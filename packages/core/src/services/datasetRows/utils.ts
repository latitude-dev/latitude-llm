import { type DatasetRowDataContent } from '../../schema'

export function parseRowCell({ cell }: { cell: DatasetRowDataContent }) {
  if (cell === null || cell === undefined) return ''

  if (
    typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
  ) {
    return String(cell)
  }

  if (typeof cell === 'object') {
    try {
      return JSON.stringify(cell, null, 2)
    } catch {
      return String(cell)
    }
  }

  return String(cell)
}
