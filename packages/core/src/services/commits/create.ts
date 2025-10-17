import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema/models/commits'
import { pingProjectUpdate } from '../projects'
import { CommitsRepository } from '../../repositories/commitsRepository'

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
      const commitsScope = new CommitsRepository(project.workspaceId, tx)
      const liveCommit = await commitsScope.getHeadCommit(project.id)

      const [commit] = await tx
        .insert(commits)
        .values({
          projectId: project.id,
          userId: user.id,
          title,
          description,
          version,
          mergedAt,
          mainDocumentUuid: liveCommit?.mainDocumentUuid,
        })
        .returning()

      await pingProjectUpdate(
        {
          projectId: project.id,
        },
        transaction,
      ).then((r) => r.unwrap())

      return Result.ok(commit!)
    },
    (commit) =>
      publisher.publishLater({
        type: 'commitCreated',
        data: {
          commit,
          userEmail: user.email,
          workspaceId: project.workspaceId,
        },
      }),
  )
}
