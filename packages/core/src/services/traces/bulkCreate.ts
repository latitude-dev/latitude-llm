import type { Project } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { traces } from '../../schema/models/traces'

export type BulkCreateTraceProps = {
  project: Project
  traces: Array<{
    traceId: string
    name?: string
    startTime: Date
    endTime?: Date
    attributes?: Record<string, string | number | boolean>
    status?: string
  }>
}

export async function bulkCreateTraces(
  { project, traces: tracesToCreate }: BulkCreateTraceProps,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(traces)
      .values(
        tracesToCreate.map((trace) => ({
          projectId: project.id,
          traceId: trace.traceId,
          name: trace.name,
          startTime: trace.startTime,
          endTime: trace.endTime,
          attributes: trace.attributes,
          status: trace.status,
        })),
      )
      .returning()

    return Result.ok(result)
  }, db)
}
