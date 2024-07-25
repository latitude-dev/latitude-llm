import {
  Commit,
  commits,
  Database,
  database,
  Result,
  Transaction,
} from '@latitude-data/core'

export async function createCommit({
  commit: { projectId, title, mergedAt },
  db = database,
}: {
  commit: {
    projectId: number
    title?: string
    mergedAt?: Date
  }
  db?: Database
}) {
  return Transaction.call<Commit>(async (tx) => {
    const result = await tx
      .insert(commits)
      .values({
        projectId,
        title,
        mergedAt,
      })
      .returning()
    const createdCommit = result[0]

    return Result.ok(createdCommit!)
  }, db)
}
