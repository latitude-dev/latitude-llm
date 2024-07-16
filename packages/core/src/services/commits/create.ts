import {
  Commit,
  commits,
  Database,
  database,
  Result,
  Transaction,
} from '@latitude-data/core'

export default async function createCommit({
  projectId,
  db = database,
}: {
  projectId: number
  db?: Database
}) {
  return Transaction.call<Commit>(async (tx) => {
    const result = await tx.insert(commits).values({ projectId }).returning()
    const commit = result[0]

    return Result.ok(commit!)
  }, db)
}
