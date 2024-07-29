import {
  Commit,
  commits,
  Database,
  database,
  Project,
  Result,
  Transaction,
} from '@latitude-data/core'

export async function createCommit({
  project,
  data: { title, mergedAt },
  db = database,
}: {
  project: Project
  data: {
    title?: string
    mergedAt?: Date
  }
  db?: Database
}) {
  return Transaction.call<Commit>(async (tx) => {
    const result = await tx
      .insert(commits)
      .values({
        projectId: project.id,
        title,
        mergedAt,
      })
      .returning()
    const createdCommit = result[0]

    return Result.ok(createdCommit!)
  }, db)
}
