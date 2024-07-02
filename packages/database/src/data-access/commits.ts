import { Database } from '$db/client'
import { commits } from '$db/schema'

export async function listCommits({ db }: { db: Database }) {
  return db
    .select({
      uuid: commits.uuid,
      title: commits.title,
      description: commits.description,
    })
    .from(commits)
}
