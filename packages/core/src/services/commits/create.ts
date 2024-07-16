import {
  Commit,
  commits,
  database,
  Result,
  Transaction,
} from '@latitude-data/core'

export async function createCommit(
  commit: Omit<Partial<Commit>, 'id'>,
  db = database,
) {
  return Transaction.call<Commit>(async (tx) => {
    const result = await tx
      .insert(commits)
      .values({ projectId: commit.projectId!, title: commit.title })
      .returning()
    const createdCommit = result[0]

    return Result.ok(createdCommit!)
  }, db)
}
