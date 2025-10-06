import { Commit, Project, User, Workspace } from '../../schema/types'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { projects } from '../../schema/models/projects'
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
  transaction = new Transaction(),
) {
  return transaction.call<{ project: Project; commit: Commit }>(
    async (tx) => {
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
        transaction,
      )
      if (result.error) return result
      const commit = result.unwrap()

      return Result.ok({ project, commit })
    },
    ({ project, commit }) =>
      publisher.publishLater({
        type: 'projectCreated',
        data: {
          project,
          commit,
          workspaceId: workspace.id,
          userEmail: user.email,
        },
      }),
  )
}
