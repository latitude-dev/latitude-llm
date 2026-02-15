import { eq } from 'drizzle-orm'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { experiments } from '../../schema/models/experiments'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type Workspace } from '../../schema/models/types/Workspace'
import { startWorkflow } from '../../temporal/client'
import { getExperimentJobPayload } from './start/getExperimentJobPayload'
import { WebsocketClient } from '../../websockets/workers'

const EXPERIMENT_WORKFLOW_NAME = 'experimentWorkflow'

export async function startExperimentWithTemporal(
  {
    experimentUuid,
    workspace,
  }: {
    experimentUuid: string
    workspace: Workspace
  },
  transaction = new Transaction(),
): PromisedResult<Experiment, LatitudeError> {
  const result = await transaction.call(async (tx) => {
    const updateResult = await tx
      .update(experiments)
      .set({
        startedAt: new Date(),
      })
      .where(eq(experiments.uuid, experimentUuid))
      .returning()

    if (!updateResult.length) {
      return Result.error(new LatitudeError('Failed to update experiment'))
    }

    const experiment = updateResult[0]! as Experiment

    const payloadResult = await getExperimentJobPayload(
      {
        experiment,
        workspace,
      },
      tx,
    )
    if (payloadResult.error) {
      return Result.error(payloadResult.error as LatitudeError)
    }

    const { rows } = payloadResult.unwrap()

    try {
      await startWorkflow(EXPERIMENT_WORKFLOW_NAME, {
        workflowId: `experiment-${experimentUuid}`,
        args: [
          {
            workspaceId: workspace.id,
            experimentUuid,
          },
        ],
      })
    } catch (error) {
      return Result.error(
        new LatitudeError(`Failed to start Temporal workflow: ${error}`),
      )
    }

    WebsocketClient.sendEvent('experimentStatus', {
      workspaceId: workspace.id,
      data: {
        experiment: {
          ...experiment,
          results: {
            total: rows.length,
            completed: 0,
            passed: 0,
            failed: 0,
            errors: 0,
            totalScore: 0,
          },
        },
      },
    })

    return Result.ok(experiment)
  })

  if (result.error) return Result.error(result.error as LatitudeError)

  return Result.ok(result.value)
}
