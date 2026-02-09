import { Job } from 'bullmq'
import { sql } from 'drizzle-orm'

import { database } from '../../../client'
import { captureException } from '../../../utils/datadogCapture'

export type ManageEvaluationResultsPartitionsJobData = Record<string, never>

const SCHEMA = 'latitude'
const TABLE = 'evaluation_results_v2'
const WEEKS_AHEAD = 4
const RETENTION_WEEKS = 13

/**
 * Daily job that manages weekly partitions for evaluation_results_v2:
 * - Creates partitions for the next WEEKS_AHEAD weeks
 * - Detaches partitions older than RETENTION_WEEKS weeks
 * - Alerts if the DEFAULT partition has accumulated rows
 */
export async function manageEvaluationResultsPartitionsJob(
  _: Job<ManageEvaluationResultsPartitionsJobData>,
) {
  await createFuturePartitions()
  await detachOldPartitions()
  await checkDefaultPartition()
}

async function createFuturePartitions() {
  for (let i = 0; i < WEEKS_AHEAD; i++) {
    const partitionStart = getMondayOffset(i)
    const partitionEnd = getMondayOffset(i + 1)
    const partitionName = `${TABLE}_p${formatDate(partitionStart)}`

    const exists = await partitionExists(partitionName)
    if (exists) continue

    try {
      await database.execute(
        sql.raw(`
        CREATE TABLE IF NOT EXISTS "${SCHEMA}"."${partitionName}"
        PARTITION OF "${SCHEMA}"."${TABLE}"
        FOR VALUES FROM ('${partitionStart}') TO ('${partitionEnd}')
      `),
      )
    } catch (error) {
      captureException(error as Error, {
        extra: { partitionName, partitionStart, partitionEnd },
      })
    }
  }
}

async function detachOldPartitions() {
  const cutoffDate = getMondayOffset(-RETENTION_WEEKS)

  const partitions = await database.execute(
    sql.raw(`
    SELECT c.relname AS partition_name
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
    WHERE p.relname = '${TABLE}'
      AND n.nspname = '${SCHEMA}'
      AND c.relname LIKE '${TABLE}_p%'
    ORDER BY c.relname
  `),
  )

  for (const row of partitions.rows) {
    const partitionName = row.partition_name as string
    const dateStr = partitionName.replace(`${TABLE}_p`, '')

    if (dateStr < formatDate(cutoffDate)) {
      try {
        await database.execute(
          sql.raw(`
          ALTER TABLE "${SCHEMA}"."${TABLE}"
          DETACH PARTITION "${SCHEMA}"."${partitionName}"
        `),
        )
      } catch (error) {
        captureException(error as Error, {
          extra: { partitionName },
        })
      }
    }
  }
}

async function checkDefaultPartition() {
  const result = await database.execute(
    sql.raw(`
    SELECT EXISTS (
      SELECT 1 FROM "${SCHEMA}"."${TABLE}_default" LIMIT 1
    ) AS has_rows
  `),
  )

  const hasRows = result.rows[0]?.has_rows as boolean
  if (hasRows) {
    captureException(
      new Error(
        'DEFAULT partition for evaluation_results_v2 contains rows. ' +
          'This indicates rows with created_at outside any defined partition range.',
      ),
    )
  }
}

async function partitionExists(partitionName: string): Promise<boolean> {
  return database
    .execute(
      sql.raw(`
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = '${partitionName}'
      AND n.nspname = '${SCHEMA}'
  `),
    )
    .then((r) => r.rows.length > 0)
}

function getMondayOffset(weeksFromNow: number): string {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday + weeksFromNow * 7)
  return formatDate(monday)
}

function formatDate(d: Date | string): string {
  if (typeof d === 'string') return d
  return d.toISOString().split('T')[0]!
}
