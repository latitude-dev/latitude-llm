import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function validateOptimization(
  {
    optimization,
    workspace,
    abortSignal,
  }: {
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal
  },
  transaction = new Transaction(),
) {
  if (optimizations.validatedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already validated'),
    )
  }

  // TODO(AO/OPT): Implement

  /*
- Check LATITUDE_CLOUD, return CLOUD_MESSAGES.promptOptimization if not true
- Check optimizations feature flag is enabled
.... TODO

launch experiment from the from version and the optimized version (in the from version and to optimized version cells add all info toghether) and link to the experiments table with these 2 selected


- Set validatedAt
- Send optimizationValidated event

- Create a draft with the optimized prompt
*/

  return await transaction.call(
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
}
