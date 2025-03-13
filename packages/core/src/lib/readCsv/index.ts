import { isNumber } from 'lodash-es'

import { parse as csvParse, Info } from 'csv-parse'
import { CsvError, parse, type Options as CsvOptions } from 'csv-parse/sync'
import { castCell } from './castCells'

import { Result } from '../Result'
import { Readable } from 'node:stream'

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

function buildCsvOptions({
  delimiter,
  toLine,
  fromLine,
  columns = true,
}: ParseCsvOptions) {
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

  return opts
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
  options: ParseCsvOptions,
) {
  try {
    const data = await getData(file)
    const opts = buildCsvOptions(options)
    const records = parse(data, opts) as ParseResult[]

    if (records.length < 1) {
      return Result.ok({ headers: [], rowCount: 0, data: [] })
    }

    const firstRecord = records[0]!
    const headers =
      firstRecord.info?.columns?.map?.((column) => column.name) ?? []

    return Result.ok({ rowCount: records.length, headers, data: records })
  } catch (e) {
    const error = e as CsvError
    return Result.error(error)
  }
}

export type CSVRow = {
  record: Record<string, string>
  info: Info & {
    error?: CsvError
  }
}

export type CsvBatch = CSVRow[]

// Reasonable for postgresql to manage
export const DEFAULT_CSV_BATCH_SIZE = 1000
type StreamArgs = ParseCsvOptions & { stream: Readable; batchSize?: number }

export async function* csvBatchGenerator({
  stream,
  batchSize = DEFAULT_CSV_BATCH_SIZE,
  ...options
}: StreamArgs) {
  const defaultOpts = buildCsvOptions(options)
  const opts = {
    ...defaultOpts,
    // https://csv.js.org/parse/options/bom/#option-code-classlanguage-textbomcode
    // It stands for Byte Order Mark (BOM) —
    // a hidden character (U+FEFF) sometimes placed at the start of a UTF-8 file.
    // It's added by some programs like Excel or Google Sheets to indicate that the file is UTF-8 encoded.
    bom: true,
    cast: castCell,
  }

  const parser = stream.pipe(csvParse(opts))

  let batch: CsvBatch = []
  for await (const r of parser) {
    const record = r as CSVRow

    if (!record.info.error) {
      batch.push(record)

      if (batch.length === batchSize) {
        yield batch.splice(0)
      }
    }
  }

  // ✅ Ensure the last batch is processed
  if (batch.length > 0) {
    yield batch
  }

  // End of reading csv stream file
  yield null
}
