import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function endOptimization(
  {
    error,
    optimization,
    workspace,
  }: {
    error?: string
    optimization: Optimization
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  if (optimization.finishedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already ended'),
    )
  }

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      optimization = (await tx
        .update(optimizations)
        .set({
          error: error,
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(optimizations.workspaceId, workspace.id),
            eq(optimizations.id, optimization.id),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as Optimization

      return Result.ok({ optimization })
    },
    async ({ optimization }) => {
      const payload = {
        workspaceId: workspace.id,
        optimizationId: optimization.id,
      }

      await publisher.publishLater({
        type: 'optimizationEnded',
        data: payload,
      })
    },
  )
}
