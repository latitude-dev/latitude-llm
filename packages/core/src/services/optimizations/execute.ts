import { and, eq } from 'drizzle-orm'
import { database } from '../../client'
import { EvaluationResultV2 } from '../../constants'
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
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createCommit } from '../commits/create'
import { scanDocumentContent } from '../documents'
import { updateDocument } from '../documents/update'
import { OPTIMIZATION_ENGINES, OptimizerEvaluateArgs } from './optimizers'

// TODO(AO/OPT): Remove this, just for testing
async function awaitTesting(iterations?: number) {
  if (process.env.NODE_ENV === 'test') return

  const minMs = 10000
  const maxMs = 45000

  let waitMs = minMs + Math.round(((maxMs - minMs) * (iterations ?? 0)) / 100)
  waitMs = Math.min(maxMs, Math.max(minMs, waitMs))

  await new Promise((resolve) => setTimeout(resolve, waitMs))
}

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

  // TODO(AO/OPT): Remove this, just for testing
  await awaitTesting(optimization.configuration?.iterations)

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

  const optimize = OPTIMIZATION_ENGINES[optimization.engine]
  if (!optimize) {
    return Result.error(
      new UnprocessableEntityError(
        `Cannot execute an optimization with unknown engine: ${optimization.engine}`,
      ),
    )
  }

  const optimizing = await optimize({
    evaluate: evaluatePrompt,
    evaluation: evaluation,
    dataset: trainset,
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

async function evaluatePrompt(
  {
    prompt: _prompt,
    example: _example,
    evaluation: _evaluation,
    optimization: _optimization,
    workspace: _workspace,
  }: OptimizerEvaluateArgs, // TODO(AO/OPT): Implement cancellation
  _ = database,
) {
  // TODO(AO/OPT): Implement (get the reasoning as the Actual Output + Reasoning Specification Method) (Also treat prompt syntax errors as learnable)
  return Result.ok<EvaluationResultV2>(undefined as any)
}
