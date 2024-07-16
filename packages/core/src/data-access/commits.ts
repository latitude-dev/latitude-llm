import { database } from '$core/client'
import { HEAD_COMMIT } from '$core/constants'
import { commits } from '$core/schema'
import { desc, eq, isNull } from 'drizzle-orm'

const selectCondition = (uuid?: Exclude<string, 'HEAD'>) => {
  if (!uuid) return isNull(commits.nextCommitId)

  return eq(commits.uuid, uuid)
}

export async function findCommit({ uuid }: { uuid?: string }, tx = database) {
  if (uuid === HEAD_COMMIT) {
    return tx.query.commits.findFirst({ orderBy: desc(commits.id) })
  }

  return tx.query.commits.findFirst({ where: selectCondition(uuid) })
}

export async function listCommits() {
  return database.select().from(commits)
}

export async function listStagedCommits() {
  return database.select().from(commits).where(isNull(commits.nextCommitId))
}
