import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema/models/commits'
import { pingProjectUpdate } from '../projects'
import { CommitsRepository } from '../../repositories/commitsRepository'
import { Database } from '../../client'

async function findCommit(
  { baseCommit, project }: { baseCommit?: Commit; project: Project },
  db: Database,
) {
  if (baseCommit) return baseCommit

  const commitsScope = new CommitsRepository(project.workspaceId, db)
  return commitsScope.getHeadCommit(project.id)
}

export async function createCommit(
  {
    project,
    user,
    data: { title, description, mergedAt, version },
    baseCommit,
  }: {
    project: Project
    user: User
    data: {
      title: string
      description?: string
      version?: number
      mergedAt?: Date
    }
    baseCommit?: Commit
  },
  transaction = new Transaction(),
) {
  return transaction.call<Commit>(
    async (tx) => {
      const fromCommit = await findCommit({ project, baseCommit }, tx)

      const [commit] = await tx
        .insert(commits)
        .values({
          projectId: project.id,
          userId: user.id,
          title,
          description,
          version,
          mergedAt,
          mainDocumentUuid: fromCommit?.mainDocumentUuid,
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
