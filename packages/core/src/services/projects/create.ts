import { database, projects, Result, Transaction } from '@latitude-data/core'
import { Project, SafeUser, Workspace } from '$core/browser'
import { createCommit } from '$core/services/commits/create'

export async function createProject(
  {
    workspace,
    user,
    name = 'First Project',
  }: {
    name?: string
    workspace: Workspace
    user: SafeUser
  },
  db = database,
) {
  return Transaction.call<Project>(async (tx) => {
    const project = (
      await tx
        .insert(projects)
        .values({ workspaceId: workspace.id, name })
        .returning()
    )[0]!

    const result = await createCommit({
      data: {
        title: 'Initial version',
        mergedAt: new Date(),
        version: 0,
      },
      project,
      user,
      db: tx,
    })
    if (result.error) return result

    return Result.ok(project)
  }, db)
}
