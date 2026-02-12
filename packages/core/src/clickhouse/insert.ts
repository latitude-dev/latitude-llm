import { clickhouseClient } from '../client/clickhouse'
import { Result, TypedResult } from '../lib/Result'
import { captureException } from '../utils/datadogCapture'

export function toClickHouseDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`)
  }
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

export async function insertRows<TRow extends Record<string, unknown>>(
  table: string,
  rows: TRow[],
): Promise<TypedResult<undefined>> {
  if (rows.length === 0) return Result.nil()

  try {
    await clickhouseClient().insert({
      table,
      values: rows,
      format: 'JSONEachRow',
    })
    return Result.nil()
  } catch (error) {
    captureException(error as Error)
    return Result.error(error as Error)
  }
}
