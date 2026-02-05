import { type Experiment } from '../../../schema/models/types/Experiment'
import { LatitudeError } from '../../../lib/errors'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { experiments } from '../../../schema/models/experiments'
import { eq } from 'drizzle-orm'
import {
  ExperimentRow,
  getExperimentJobPayload,
} from './getExperimentJobPayload'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { enqueueRun } from '../../runs/enqueue'
import { LogSources } from '@latitude-data/constants'
import { SimulationSettings } from '@latitude-data/constants/simulation'
import { initializeExperimentStatus } from '../updateStatus'

function buildRowSimulationSettings(
  baseSettings: SimulationSettings | undefined,
  row: ExperimentRow,
): SimulationSettings {
  const settings = baseSettings ?? { simulateToolResponses: true }

  if (row.simulatedUserGoal !== undefined) {
    return {
      ...settings,
      simulatedUserGoal: row.simulatedUserGoal,
    }
  }

  if (settings.simulatedUserGoalSource?.type === 'global') {
    return {
      ...settings,
      simulatedUserGoal: settings.simulatedUserGoalSource.value,
    }
  }

  return settings
}

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

  await initializeExperimentStatus({
    workspaceId: workspace.id,
    experiment,
    uuids: rows.map((row) => row.uuid),
  })

  for await (const row of rows) {
    await enqueueRun({
      runUuid: row.uuid,
      workspace,
      project,
      commit,
      experiment,
      document,
      parameters: row.parameters,
      datasetRowId: row.datasetRowId,
      source: LogSources.Experiment,
      simulationSettings: buildRowSimulationSettings(
        experiment.metadata.simulationSettings,
        row,
      ),
    })
  }

  return Result.ok(experiment)
}
