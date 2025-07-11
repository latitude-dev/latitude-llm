import { Commit, Project, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
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
  return Transaction.call<{ project: Project; commit: Commit }>(async (tx) => {
    const project = (
      await tx
        .insert(projects)
        .values({ workspaceId: workspace.id, name })
        .returning()
    )[0]!

    const result = await createCommit(
      {
        data: {
          title: 'Initial version',
          version: 0,
          mergedAt,
        },
        project,
        user,
      },
      tx,
    )
    if (result.error) return result

    publisher.publishLater({
      type: 'projectCreated',
      data: {
        project,
        commit: result.value,
        workspaceId: workspace.id,
        userEmail: user.email,
      },
    })

    return Result.ok({ project, commit: result.value })
  }, db)
}
