import { and, eq } from 'drizzle-orm'
import { scan } from 'promptl-ai'
import { database } from '../../client'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  EvaluationV2,
  LogSources,
  SpanType,
  SpanWithDetails,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { validateOptimizationJobKey } from '../../jobs/job-definitions/optimizations/validateOptimizationJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  CommitsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  ProjectsRepository,
  UsersRepository,
} from '../../repositories'
import {
  SpanMetadatasRepository,
  SpansRepository,
} from '../../repositories/spansRepository'
import { Column } from '../../schema/models/datasets'
import { optimizations } from '../../schema/models/optimizations'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Optimization } from '../../schema/models/types/Optimization'
import {
  WorkspaceDto,
  type Workspace,
} from '../../schema/models/types/Workspace'
import { BACKGROUND } from '../../telemetry'
import { createCommit } from '../commits/create'
import { runDocumentAtCommit } from '../commits/runDocumentAtCommit'
import { scanDocumentContent } from '../documents'
import { updateDocument } from '../documents/update'
import { runEvaluationV2 } from '../evaluationsV2/run'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'
import { OPTIMIZATION_ENGINES, OptimizerEvaluateArgs } from './optimizers'
import { hashParameters } from './shared'

export async function executeOptimization(
  {
    optimization,
    workspace,
    abortSignal,
  }: {
    optimization: Optimization
    workspace: Workspace
    abortSignal?: AbortSignal // TODO(AO/OPT): Implement cancellation
  },
  transaction = new Transaction(),
) {
  if (optimization.executedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already executed'),
    )
  }

  if (optimization.finishedAt) {
    return Result.error(
      new UnprocessableEntityError('Optimization already ended'),
    )
  }

  if (!optimization.trainsetId) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot execute an optimization without a trainset',
      ),
    )
  }

  if (!optimization.testsetId) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot execute an optimization without a testset',
      ),
    )
  }

  const projectsRepository = new ProjectsRepository(workspace.id)
  const gettingpj = await projectsRepository.find(optimization.projectId)
  if (gettingpj.error) {
    return Result.error(gettingpj.error)
  }
  const project = gettingpj.value

  const commitsRepository = new CommitsRepository(workspace.id)
  const gettingco = await commitsRepository.getCommitById(
    optimization.baselineCommitId,
  )
  if (gettingco.error) {
    return Result.error(gettingco.error)
  }
  const baselineCommit = gettingco.value

  const documentsRepository = new DocumentVersionsRepository(workspace.id)
  const gettingdo = await documentsRepository.getDocumentAtCommit({
    commitUuid: baselineCommit.uuid,
    documentUuid: optimization.documentUuid,
  })
  if (gettingdo.error) {
    return Result.error(gettingdo.error)
  }
  const document = gettingdo.value

  const userRepository = new UsersRepository(workspace.id)
  const finding = await userRepository.find(baselineCommit.userId)
  if (finding.error) {
    return Result.error(finding.error)
  }
  const author = finding.value

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const gettingev = await evaluationsRepository.getAtCommitByDocument({
    commitId: baselineCommit.id,
    documentUuid: document.documentUuid,
    evaluationUuid: optimization.evaluationUuid,
  })
  if (gettingev.error) {
    return Result.error(gettingev.error)
  }
  const evaluation = gettingev.value

  const datasetsRepository = new DatasetsRepository(workspace.id)

  const gettingds = await datasetsRepository.find(optimization.trainsetId)
  if (gettingds.error) {
    return Result.error(gettingds.error)
  }
  const trainset = gettingds.value

  const gettingts = await datasetsRepository.find(optimization.testsetId)
  if (gettingts.error) {
    return Result.error(gettingts.error)
  }
  const testset = gettingts.value

  const columns = trainset.columns
    .map((c) => ({ ...c, datasetId: trainset.id }))
    .concat(testset.columns.map((c) => ({ ...c, datasetId: testset.id })))

  const optimize = OPTIMIZATION_ENGINES[optimization.engine]
  if (!optimize) {
    return Result.error(
      new UnprocessableEntityError(
        `Cannot execute an optimization with unknown engine: ${optimization.engine}`,
      ),
    )
  }

  // BONUS(AO/OPT): Implement checkpointing saving for fault tolerance
  const optimizing = await optimize({
    evaluate: await evaluatePrompt({
      columns: columns,
      evaluation: evaluation,
      optimization: optimization,
      document: document,
      commit: baselineCommit,
      workspace: workspace as WorkspaceDto,
    }),
    evaluation: evaluation,
    trainset: trainset,
    valset: testset, // BONUS(AO/OPT): Only use a small subset of the testset
    optimization: optimization,
    workspace: workspace,
    abortSignal: abortSignal,
  })
  if (optimizing.error) {
    return Result.error(optimizing.error)
  }
  const optimizedPrompt = optimizing.value

  const scanning = await scanDocumentContent({
    document: { ...document, content: optimizedPrompt },
    commit: baselineCommit,
  })
  if (scanning.error) {
    return Result.error(scanning.error)
  } else if (scanning.value.errors.length > 0) {
    return Result.error(
      new UnprocessableEntityError('Optimized prompt has errors'),
    )
  }

  return await transaction.call(
    async (tx) => {
      const now = new Date()

      const optimizedCommit = await createCommit(
        {
          project: project,
          user: author,
          data: {
            title: `Optimized ${document.path.split('/').pop()} #${optimization.uuid.slice(0, 8)}`,
            description: 'Created by an optimization.',
          },
        },
        transaction,
      ).then((r) => r.unwrap())

      await updateDocument(
        { commit: optimizedCommit, document, content: optimizedPrompt },
        transaction,
      ).then((r) => r.unwrap())

      optimization = (await tx
        .update(optimizations)
        .set({
          optimizedCommitId: optimizedCommit.id,
          optimizedPrompt: optimizedPrompt,
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

      return Result.ok({ optimization, optimized: { commit: optimizedCommit, prompt: optimizedPrompt } }) // prettier-ignore
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

// BONUS(AO/OPT): Implement multi-objective optimization
async function evaluatePrompt<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  columns,
  evaluation,
  optimization,
  document,
  commit,
  workspace,
}: {
  columns: (Column & { datasetId: number })[]
  evaluation: EvaluationV2<T, M>
  optimization: Optimization
  document: DocumentVersion
  commit: Commit
  workspace: WorkspaceDto
}) {
  const { parameters: baselineParameters } = await scan({
    prompt: optimization.baselinePrompt,
  })
  const { keyhash: parametersHash } = hashParameters(
    Object.fromEntries(baselineParameters.entries()),
  )

  return async function (
    { prompt, example, abortSignal }: OptimizerEvaluateArgs, // TODO(AO/OPT): Implement cancellation
    _ = database,
  ) {
    const scanning = await scanDocumentContent({
      document: { ...document, content: prompt },
      commit: commit,
    })
    if (scanning.error) {
      return Result.error(scanning.error)
    } else if (scanning.value.errors.length > 0) {
      // Note: we treat prompt syntax errors as learnable
      let reason = ''
      for (const error of scanning.value.errors) {
        reason += error.toString() + '\n\n'
      }
      reason = reason.trim()

      return Result.ok({
        trace: [],
        result: { score: 0, reason, passed: false },
      })
    }
    const { parameters } = scanning.value

    const { keyhash } = hashParameters(Object.fromEntries(parameters.entries()))
    if (keyhash !== parametersHash) {
      // Note: we treat prompt syntax errors as learnable
      const reason = `
The optimized prompt must have the same parameters as the baseline prompt.
The parameters are: ${Array.from(baselineParameters).join(', ')}`.trim()

      return Result.ok({
        trace: [],
        result: { score: 0, reason, passed: false },
      })
    }

    const values: Record<string, unknown> = {}
    for (const parameter of parameters) {
      const column =
        optimization.configuration.parameters?.[parameter]?.column ?? parameter

      const identifier = columns.find(
        (c) => c.name === column && c.datasetId === example.datasetId,
      )!.identifier

      values[parameter] = example.rowData[identifier] ?? undefined
    }

    const running = await runDocumentAtCommit({
      context: BACKGROUND({ workspaceId: workspace.id }),
      source: LogSources.Optimization,
      parameters: values,
      customPrompt: prompt,
      simulationSettings: {
        simulateToolResponses:
          optimization.configuration.simulation?.simulateToolResponses ?? true,
        simulatedTools:
          optimization.configuration.simulation?.simulatedTools ?? [], // Note: empty array means all tools are simulated
        toolSimulationInstructions:
          optimization.configuration.simulation?.toolSimulationInstructions ??
          '',
      },
      document: document,
      commit: commit,
      workspace: workspace,
      abortSignal: abortSignal,
    })
    if (running.error) {
      return Result.error(running.error)
    }
    const conversationUuid = running.value.uuid

    // TODO(AO/OPT): Implement waiting for trace to show up
    await new Promise((resolve) => setTimeout(resolve, 10000))

    const spansRepository = new SpansRepository(workspace.id)
    const metadatasRepository = new SpanMetadatasRepository(workspace.id)

    const traceId =
      await spansRepository.getLastTraceByLogUuid(conversationUuid)

    const listing = await spansRepository.list({ traceId })
    if (listing.error) {
      return Result.error(listing.error)
    }
    const trace = listing.value

    const span = trace.find((span) => span.type === SpanType.Prompt)
    if (!span) {
      return Result.error(new UnprocessableEntityError('No prompt span found'))
    }

    const getting = await metadatasRepository.get({
      spanId: span.id,
      traceId: span.traceId,
    })
    if (getting.error) {
      return Result.error(getting.error)
    }
    const metadata = getting.value

    const evaluating = await runEvaluationV2({
      evaluation: evaluation,
      span: { ...span, metadata } as SpanWithDetails<SpanType.Prompt>,
      commit: commit,
      workspace: workspace,
      dry: false, // BONUS(AO/OPT): Should we persist evaluation results from optimization runs?
    })
    if (evaluating.error) {
      return Result.error(evaluating.error)
    }
    const { result } = evaluating.value

    if (result.error) {
      return Result.error(
        new UnprocessableEntityError(
          `Error while evaluating: ${result.error.message}`,
        ),
      )
    }

    const specification = getEvaluationMetricSpecification(evaluation)
    const reason = specification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    )

    return Result.ok({
      trace: [], // TODO(AO/OPT): Add trace to result
      result: {
        score: result.normalizedScore ?? 0,
        reason: reason ?? '',
        passed: result.hasPassed ?? false,
      },
    })
  }
}
