import { Project, User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { projects } from '../../schema'
import { createCommit } from '../commits/create'

export async function createProject(
  {
    workspace,
    user,
    name,
    mergedAt,
  }: {
    name: string
    workspace: Workspace
    user: User
    mergedAt?: Date
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
        version: 0,
        mergedAt,
      },
      project,
      user,
      db: tx,
    })
    if (result.error) return result

    return Result.ok(project)
  }, db)
}
