import { Project, SafeUser, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { projects } from '../../schema'
import { createCommit } from '../commits/create'

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
