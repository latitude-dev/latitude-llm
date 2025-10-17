import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
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
