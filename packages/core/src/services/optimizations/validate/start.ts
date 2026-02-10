import { and, eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'
import { optimizations } from '../../../schema/models/optimizations'
import { Optimization } from '../../../schema/models/types/Optimization'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { createExperiment } from '../../experiments/create'
import { startExperiment } from '../../experiments/start'

export async function startValidateOptimization(
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

  if (!optimization.testsetId) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot validate an optimization without a testset',
      ),
    )
  }

  if (!optimization.optimizedCommitId) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot validate an optimization without an optimized commit',
      ),
    )
  }

  if (!optimization.optimizedPrompt) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot validate an optimization without an optimized prompt',
      ),
    )
  }

  const datasetsRepository = new DatasetsRepository(workspace.id)
  const gettingds = await datasetsRepository.find(optimization.testsetId)
  if (gettingds.error) {
    return Result.error(gettingds.error)
  }
  const testset = gettingds.value

  const rowsRepository = new DatasetRowsRepository(workspace.id)
  const testrows = await rowsRepository.getCountByDataset(testset.id)

  const commitsRepository = new CommitsRepository(workspace.id)

  const gettingbc = await commitsRepository.getCommitById(
    optimization.baselineCommitId,
  )
  if (gettingbc.error) {
    return Result.error(gettingbc.error)
  }
  const baselineCommit = gettingbc.value

  const gettingoc = await commitsRepository.getCommitById(
    optimization.optimizedCommitId,
  )
  if (gettingoc.error) {
    return Result.error(gettingoc.error)
  }
  const optimizedCommit = gettingoc.value

  const documentsRepository = new DocumentVersionsRepository(workspace.id)

  const gettingbd = await documentsRepository.getDocumentAtCommit({
    commitUuid: baselineCommit.uuid,
    documentUuid: optimization.documentUuid,
  })
  if (gettingbd.error) {
    return Result.error(gettingbd.error)
  }
  const baselineDocument = gettingbd.value

  const gettingod = await documentsRepository.getDocumentAtCommit({
    commitUuid: optimizedCommit.uuid,
    documentUuid: optimization.documentUuid,
  })
  if (gettingod.error) {
    return Result.error(gettingod.error)
  }
  const optimizedDocument = gettingod.value

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const gettingev = await evaluationsRepository.getAtCommitByDocument({
    commitUuid: baselineCommit.uuid,
    documentUuid: baselineDocument.documentUuid,
    evaluationUuid: optimization.evaluationUuid,
  })
  if (gettingev.error) {
    return Result.error(gettingev.error)
  }
  const evaluation = gettingev.value

  const { parameters } = await scan({ prompt: optimization.baselinePrompt })
  const testcols: Record<string, number> = {}
  for (const parameter of parameters) {
    const column =
      optimization.configuration.parameters?.[parameter]?.column ?? parameter
    testcols[parameter] = testset.columns.findIndex((c) => c.name === column)
  }

  const population = {
    source: 'dataset' as const,
    dataset: testset,
    datasetLabels: {},
    parametersMap: testcols,
    fromRow: 1, // Note: 1-based index
    toRow: testrows, // Note: 1-based index
  }

  const simulation = optimization.configuration.simulation ?? {
    simulateToolResponses: true,
    simulatedTools: [], // Note: empty array means all tools are simulated
    toolSimulationInstructions: '',
  }

  const creatingex = await transaction.call(async (tx) => {
    const now = new Date()

    const baseline = await createExperiment(
      {
        name: `Baseline #${optimization.uuid.slice(0, 8)}`,
        commit: baselineCommit,
        document: baselineDocument,
        customPrompt: optimization.baselinePrompt,
        evaluations: [evaluation],
        parametersPopulation: population,
        simulationSettings: simulation,
        workspace: workspace,
      },
      transaction,
    ).then((r) => r.unwrap())

    const optimized = await createExperiment(
      {
        name: `Optimized #${optimization.uuid.slice(0, 8)}`,
        commit: optimizedCommit,
        document: optimizedDocument,
        customPrompt: optimization.optimizedPrompt!,
        evaluations: [evaluation],
        parametersPopulation: population,
        simulationSettings: simulation,
        workspace: workspace,
      },
      transaction,
    ).then((r) => r.unwrap())

    optimization = (await tx
      .update(optimizations)
      .set({
        baselineExperimentId: baseline.id,
        optimizedExperimentId: optimized.id,
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

    return Result.ok({ optimization, experiments: { baseline, optimized } })
  })
  if (creatingex.error) {
    return Result.error(creatingex.error)
  }
  optimization = creatingex.value.optimization
  const experiments = creatingex.value.experiments

  // Note: this cannot be inside the transaction because the
  // enqueued task may not see the created experiment
  const startingeb = await startExperiment({
    experimentUuid: experiments.baseline.uuid,
    workspace: workspace,
  })
  if (startingeb.error) {
    return Result.error(startingeb.error)
  }
  experiments.baseline = startingeb.value

  // Note: this cannot be inside the transaction because the
  // enqueued task may not see the created experiment
  const startingeo = await startExperiment({
    experimentUuid: experiments.optimized.uuid,
    workspace: workspace,
  })
  if (startingeo.error) {
    return Result.error(startingeo.error)
  }
  experiments.optimized = startingeo.value

  return Result.ok({ optimization, experiments })
}
