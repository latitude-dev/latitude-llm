import { type Workspace } from '../../schema/models/types/Workspace'
import { type Project } from '../../schema/models/types/Project'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'

export async function createIssue(
  {
    workspace,
    project,
    documentUuid,
    title,
    description,
    createdAt,
  }: {
    workspace: Workspace
    project: Project
    documentUuid: string
    title: string
    description: string
    createdAt?: Date
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const result = await tx
      .insert(issues)
      .values({
        createdAt: createdAt ?? new Date(),
        workspaceId: workspace.id,
        projectId: project.id,
        documentUuid,
        title,
        description,
      })
      .returning()

    return Result.ok(result[0]!)
  })
}
