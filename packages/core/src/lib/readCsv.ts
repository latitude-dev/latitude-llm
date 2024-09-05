import { CsvError, parse } from 'csv-parse/sync'

import { Result } from './Result'

type ParseCsvOptions = { delimiter?: string }
export async function syncReadCsv(
  file: File,
  { delimiter = ';' }: ParseCsvOptions = {},
) {
  try {
    const data = await file.text()
    const records = parse(data, {
      delimiter,
      relax_column_count: true,
      trim: true,
      skip_empty_lines: true,
      columns: true,
      info: true,
    }) as {
      record: Record<string, string>
      info: { columns: { name: string }[] }
    }[] // not typed

    if (records.length < 1)
      return Result.ok({ headers: [], rowCount: 0, data: [] })

    const firstRecord = records[0]!
    const headers = firstRecord.info.columns.map((column) => column.name)
    return Result.ok({ rowCount: records.length, headers, data: records })
  } catch (e) {
    const error = e as CsvError
    return Result.error(error)
  }
}
