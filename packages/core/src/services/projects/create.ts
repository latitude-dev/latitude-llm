import {
  database,
  projects,
  Result,
  Transaction,
  type Project,
} from '@latitude-data/core'
import { createCommit } from '$core/services/commits/create'
import { mergeCommit } from '$core/services/commits/merge'

export async function createProject(
  {
    workspaceId,
    name = 'First Project',
  }: {
    workspaceId: number
    name?: string
  },
  db = database,
) {
  return Transaction.call<Project>(async (tx) => {
    const project = (
      await tx.insert(projects).values({ workspaceId, name }).returning()
    )[0]!
    const commit = await createCommit({
      commit: { projectId: project.id, title: 'Initial version' },
      db: tx,
    })

    if (commit.error) return commit

    const resultMerge = await mergeCommit({ commitId: commit.value.id }, tx)

    if (resultMerge.error) return resultMerge

    return Result.ok(project)
  }, db)
}
