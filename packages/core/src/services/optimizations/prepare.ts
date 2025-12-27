import { and, eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import { publisher } from '../../events/publisher'
import { executeOptimizationJobKey } from '../../jobs/job-definitions/optimizations/executeOptimizationJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function prepareOptimization(
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
  if (optimizations.preparedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already prepared'),
    )
  }

  const { parameters } = await scan({ prompt: optimization.baselinePrompt })

  // TODO(AO/OPT): Implement
  /*
This is a task that kickstarts the optimization process.
- Use abortController.signal and stop any query or operation in process


- Get a balanced list of:
  - 50% Latest traces with issues
    - Try as a best effort basis to balance this part of the dataset with the same amount of different issues
  - 50% Latest traces without issues
  - Filter out ignored issues
  - Also take care to not get duplicates because of merged issues
  - Also filter out traces with prompt parameters different from the current parameters

- Create a random trainset 70% and a random testset 30% from the list of traces
  - Ensure randomness and balance sampling. Balanced here means that if the dataset contains several examples of several issues/failure modes, there has to be equal amounts of example for each, in both the training and testing splits.
  - Use the optimization parameter configuration to mask and or generalize PII parameters
  - Set hiddenAt to the trainset and testset to avoid showing them in the dataset list and selector, only available from the url
  - Use Create Dataset from JSON with an array of row objects
- Set trainsetId and testsetId to the newly created datasets

*/

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      optimization = (await tx
        .update(optimizations)
        .set({
          preparedAt: now,
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
      await optimizationsQueue.add('executeOptimizationJob', payload, {
        jobId: `${optimization.uuid}-executeOptimizationJob`,
        attempts: 1,
        deduplication: { id: executeOptimizationJobKey(payload) },
      })

      await publisher.publishLater({
        type: 'optimizationPrepared',
        data: payload,
      })
    },
  )
}
