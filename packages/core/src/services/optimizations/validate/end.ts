import { and, eq } from 'drizzle-orm'
import { publisher } from '../../../events/publisher'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { optimizations } from '../../../schema/models/optimizations'
import { Optimization } from '../../../schema/models/types/Optimization'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { endOptimization } from '../end'

export async function endValidateOptimization(
  {
    optimization,
    workspace,
  }: {
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal // TODO(AO/OPT): Implement cancellation
  },
  transaction = new Transaction(),
) {
  if (optimization.validatedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already validated'),
    )
  }

  if (optimization.finishedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already ended'),
    )
  }

  // BONUS(AO/OPT): Remove optimized commit if it is not better?

  const updating = await transaction.call(
    async (tx) => {
      const now = new Date()

      optimization = (await tx
        .update(optimizations)
        .set({
          validatedAt: now,
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
        type: 'optimizationValidated',
        data: payload,
      })
    },
  )
  if (updating.error) {
    return Result.error(updating.error)
  }
  optimization = updating.value.optimization

  // Note: this cannot be inside the transaction because ending the
  // optimization must happen after the validated event is sent
  const ending = await endOptimization({ optimization, workspace })
  if (ending.error) {
    return Result.error(ending.error)
  }
  optimization = ending.value.optimization

  return Result.ok({ optimization })
}
