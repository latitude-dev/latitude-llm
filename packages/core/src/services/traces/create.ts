import type { Project } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { traces } from '../../schema/models/traces'

export type CreateTraceProps = {
  project: Project
  traceId: string
  name?: string
  startTime: Date
  endTime?: Date
  attributes?: Record<string, string | number | boolean>
  status?: string
}

export async function createTrace(
  {
    project,
    traceId,
    name,
    startTime,
    endTime,
    attributes,
    status,
  }: CreateTraceProps,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(traces)
      .values({
        projectId: project.id,
        traceId,
        name,
        startTime,
        endTime,
        attributes,
        status,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
