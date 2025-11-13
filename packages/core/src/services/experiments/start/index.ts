import { type Experiment } from '../../../schema/models/types/Experiment'
import { LatitudeError } from '../../../lib/errors'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { experiments } from '../../../schema/models/experiments'
import { eq } from 'drizzle-orm'
import { getExperimentJobPayload } from './getExperimentJobPayload'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { enqueueRun } from '../../runs/enqueue'
import { LogSources } from '@latitude-data/constants'
import { updateExperimentStatus } from '../updateStatus'

export async function startExperiment(
  {
    experimentUuid,
    workspace,
  }: {
    experimentUuid: string
    workspace: Workspace
  },
  transaction = new Transaction(),
): PromisedResult<Experiment, LatitudeError> {
  const updateResult = await transaction.call(async (tx) => {
    const result = await tx
      .update(experiments)
      .set({
        startedAt: new Date(),
      })
      .where(eq(experiments.uuid, experimentUuid))
      .returning()

    if (!result.length) {
      return Result.error(new LatitudeError('Failed to update experiment'))
    }

    const experiment = result[0]! as Experiment
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

    return Result.ok({
      ...payloadResult.unwrap(),
      experiment,
    })
  })

  if (updateResult.error) {
    return Result.error(updateResult.error as LatitudeError)
  }

  const { project, commit, document, experiment, rows } = updateResult.unwrap()

  await updateExperimentStatus(
    {
      workspaceId: workspace.id,
      experiment,
    },
    (progressTracker) =>
      progressTracker.incrementEnqueued(
        rows.length * experiment.evaluationUuids.length,
      ),
  )

  for await (const row of rows) {
    await enqueueRun({
      workspace,
      project,
      commit,
      experiment,
      document,
      parameters: row?.parameters ?? {},
      datasetRowId: row?.id,
      source: LogSources.Experiment,
      simulationSettings: experiment.metadata.simulationSettings ?? {
        simulateToolResponses: true,
      },
    })
  }

  return Result.ok(experiment)
}
