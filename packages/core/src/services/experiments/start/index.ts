import { Experiment } from '../../../browser'
import { LatitudeError, PromisedResult, Transaction } from '../../../lib'
import { Workspace } from '../../../browser'
import { database, Database } from '../../../client'
import { Result } from '../../../lib'
import { documentsQueue } from '../../../jobs/queues'
import { experiments } from '../../../schema'
import { eq } from 'drizzle-orm'
import { getExperimentJobPayload } from './getExperimentJobPayload'

export async function startExperiment(
  {
    experimentUuid,
    workspace,
  }: {
    experimentUuid: string
    workspace: Workspace
  },
  db: Database = database,
): PromisedResult<Experiment, LatitudeError> {
  const updateResult = await Transaction.call(async (tx) => {
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
  }, db)

  if (updateResult.error) {
    return Result.error(updateResult.error as LatitudeError)
  }

  const { experiment, commit, evaluations, rows } = updateResult.unwrap()

  for await (const row of rows) {
    // NOTE: This is running jobs for the document with different parameters
    // then the result is evaluated with `runEvaluationJob`
    await documentsQueue.add('runDocumentForExperimentJob', {
      workspaceId: workspace.id,
      projectId: commit.projectId,
      experiment: experiment,
      commitUuid: commit.uuid,
      parameters: row.parameters,
      customPrompt: prompt,
      evaluations,
      datasetRowId: row.id,
    })
  }

  return Result.ok(experiment)
}
