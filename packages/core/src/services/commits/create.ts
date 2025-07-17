import { Commit, Project, User } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema'
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
  db = database,
) {
  return Transaction.call<Commit>(async (tx) => {
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

    publisher.publishLater({
      type: 'commitCreated',
      data: {
        commit: createdCommit!,
        userEmail: user.email,
        workspaceId: project.workspaceId,
      },
    })

    await pingProjectUpdate(
      {
        projectId: project.id,
      },
      tx,
    ).then((r) => r.unwrap())

    return Result.ok(createdCommit!)
  }, db)
}
