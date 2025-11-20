import { and, eq } from 'drizzle-orm'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { issues } from '../../schema/models/issues'
import { Issue } from '../../schema/models/types/Issue'
import { checkEscalation } from './histograms/checkEscalation'

/**
 * Updates the escalating status of an issue based on its current state.
 * It set to null if not escalating, or to the current date if it is.
 */
export async function updateEscalatingIssue(
  {
    issue,
  }: {
    issue: Issue
  },
  transaction = new Transaction(),
) {
  const updatedAt = new Date()
  return transaction.call(async (tx) => {
    const { isEscalating } = await checkEscalation({ issue, db: tx })
    const escalatingAt = isEscalating ? updatedAt : null
    const result = await tx
      .update(issues)
      .set({
        escalatingAt,
        updatedAt: updatedAt,
      })
      .where(
        and(eq(issues.workspaceId, issue.workspaceId), eq(issues.id, issue.id)),
      )
      .returning()
      .then((r) => r[0]!)
    return Result.ok(result)
  })
}
