import { type Workspace } from '../../schema/models/types/Workspace'
import { type Project } from '../../schema/models/types/Project'
import { type Commit } from '../../schema/models/types/Commit'
import { EvaluationResultV2 } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'

export async function createIssue(
  {
    workspace,
    project,
    commit,
    documentUuid,
    title,
    description,
    firstSeenResult,
    lastSeenResult,
    firstSeenAt,
    lastSeenAt,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    documentUuid: string
    title: string
    description: string
    firstSeenResult?: EvaluationResultV2
    lastSeenResult?: EvaluationResultV2
    firstSeenAt?: Date
    lastSeenAt?: Date
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const now = new Date()
    const result = await tx
      .insert(issues)
      .values({
        workspaceId: workspace.id,
        projectId: project.id,
        commitId: commit.id,
        documentUuid,
        title,
        description,
        firstSeenAt: firstSeenAt ?? now,
        lastSeenAt: lastSeenAt ?? now,
        firstSeenResultId: firstSeenResult?.id,
        lastSeenResultId: lastSeenResult?.id,
      })
      .returning()

    return Result.ok(result[0]!)
  })
}
