import { and, eq } from 'drizzle-orm'
import { publisher } from '../../events/publisher'
import { validateOptimizationJobKey } from '../../jobs/job-definitions/optimizations/validateOptimizationJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function executeOptimization(
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
  if (optimizations.executedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already executed'),
    )
  }

  // TODO(AO/OPT): Implement
  /*
- Check LATITUDE_CLOUD, return CLOUD_MESSAGES.promptOptimization if not true
- Check optimizations feature flag is enabled
- set executedAt
- Send optimizationExecuted event
- Enqueue validateOptimization job
*/

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      optimization = (await tx
        .update(optimizations)
        .set({
          executedAt: now,
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

      const { optimizationsQueue } = await queues()
      await optimizationsQueue.add('validateOptimizationJob', payload, {
        jobId: `${optimization.uuid}-validateOptimizationJob`,
        attempts: 1,
        deduplication: { id: validateOptimizationJobKey(payload) },
      })

      await publisher.publishLater({
        type: 'optimizationExecuted',
        data: payload,
      })
    },
  )
}
