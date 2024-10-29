import { isNumber } from 'lodash-es'

import { CsvError, parse, type Options as CsvOptions } from 'csv-parse/sync'

import { Result } from './Result'

function getData(file: File | string) {
  if (typeof file === 'string') {
    return file
  }
  return file.text()
}

type ParseCsvOptions = {
  delimiter: string
  // https://csv.js.org/parse/options/to_line/
  toLine?: number
  fromLine?: number
  columns?: boolean
}
type ParseResult = {
  record: Record<string, string>
  info: { columns: { name: string }[] }
}
export type CsvParsedData = {
  headers: string[]
  rows: string[][]
  rowCount: number
}
export async function syncReadCsv(
  file: File | string,
  { delimiter, toLine, fromLine, columns = true }: ParseCsvOptions,
) {
  try {
    const data = await getData(file)
    let opts: CsvOptions = {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      relax_quotes: true,
      columns,
      trim: true,
      info: true,
    }

    if (isNumber(fromLine)) {
      // from: https://csv.js.org/parse/options/from/
      opts = { ...opts, from: fromLine }
    }

    if (toLine) {
      // to: https://csv.js.org/parse/options/to/
      opts = { ...opts, to: toLine }
    }

    const records = parse(data, opts) as ParseResult[]

    if (records.length < 1)
      return Result.ok({ headers: [], rowCount: 0, data: [] })

    const firstRecord = records[0]!
    const headers =
      firstRecord.info?.columns?.map?.((column) => column.name) ?? []
    return Result.ok({ rowCount: records.length, headers, data: records })
  } catch (e) {
    const error = e as CsvError
    return Result.error(error)
  }
}
