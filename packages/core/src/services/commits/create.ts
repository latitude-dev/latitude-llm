import { Commit, Project, User } from '../../schema/types'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema/models/commits'
import { pingProjectUpdate } from '../projects'

export async function createCommit(
  {
    project,
    user,
    data: { title, description, mergedAt, version },
  }: {
    project: Project
    user: User
    data: {
      title: string
      description?: string
      version?: number
      mergedAt?: Date
    }
  },
  transaction = new Transaction(),
) {
  return transaction.call<Commit>(
    async (tx) => {
      const result = await tx
        .insert(commits)
        .values({
          projectId: project.id,
          userId: user.id,
          title,
          description,
          version,
          mergedAt,
        })
        .returning()
      const createdCommit = result[0]

      await pingProjectUpdate(
        {
          projectId: project.id,
        },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok(createdCommit!)
    },
    (createdCommit) =>
      publisher.publishLater({
        type: 'commitCreated',
        data: {
          commit: createdCommit,
          userEmail: user.email,
          workspaceId: project.workspaceId,
        },
      }),
  )
}
