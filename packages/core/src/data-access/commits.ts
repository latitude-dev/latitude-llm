import { commits, database, HEAD_COMMIT } from '@latitude-data/core'
import { desc, eq, isNull } from 'drizzle-orm'

export async function findCommit({ uuid }: { uuid?: string }, tx = database) {
  const selectCondition = (uuid?: Exclude<string, 'HEAD'>) => {
    if (!uuid) return isNull(commits.nextCommitId)

    return eq(commits.uuid, uuid)
  }

  if (uuid === HEAD_COMMIT) {
    return (
      await tx.select().from(commits).orderBy(desc(commits.id)).limit(1)
    )[0]
  }

  return (
    await tx
      .select({ id: commits.id })
      .from(commits)
      .where(selectCondition(uuid))
      .limit(1)
  )[0]
}

export async function listCommits() {
  return database.select().from(commits)
}

export async function listStagedCommits() {
  return database.select().from(commits).where(isNull(commits.nextCommitId))
}
