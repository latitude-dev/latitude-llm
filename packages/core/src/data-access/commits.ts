import { Database } from '$core/client'
import { commits } from '$core/schema'

export async function listCommits({ db }: { db: Database }) {
  return db
    .select({
      uuid: commits.uuid,
      title: commits.title,
      description: commits.description,
    })
    .from(commits)
}
