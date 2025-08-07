import { Experiment } from '../../../browser'
import { LatitudeError } from '../../../lib/errors'
import { Workspace } from '../../../browser'
import { documentsQueue } from '../../../jobs/queues'
import { experiments } from '../../../schema'
import { eq } from 'drizzle-orm'
import { getExperimentJobPayload } from './getExperimentJobPayload'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { RunDocumentForExperimentJobData } from '../../../jobs/job-definitions'

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

  const { experiment, commit, rows } = updateResult.unwrap()

  for await (const row of rows) {
    await documentsQueue.add('runDocumentForExperimentJob', {
      workspaceId: workspace.id,
      projectId: commit.projectId,
      experimentId: experiment.id,
      commitUuid: commit.uuid,
      parameters: row?.parameters ?? {},
      datasetRowId: row?.id,
    } as RunDocumentForExperimentJobData)
  }

  return Result.ok(experiment)
}
