import { and, eq } from 'drizzle-orm'
import { OPTIMIZATION_VALSET_SPLIT } from '../../constants'
import { publisher } from '../../events/publisher'
import { validateOptimizationJobKey } from '../../jobs/job-definitions/optimizations/validateOptimizationJob'
import { queues } from '../../jobs/queues'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findProjectById } from '../../queries/projects/findById'
import { findWorkspaceUserById } from '../../queries/users/findInWorkspace'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { optimizations } from '../../schema/models/optimizations'
import { Optimization } from '../../schema/models/types/Optimization'
import {
  WorkspaceDto,
  type Workspace,
} from '../../schema/models/types/Workspace'
import { forkCommit } from '../commits/fork'
import { scanDocumentContent } from '../documents'
import { updateDocument } from '../documents/update'
import {
  OPTIMIZATION_ENGINES,
  evaluateFactory,
  proposeFactory,
} from './optimizers'

// BONUS(AO/OPT): Implement multi-objective optimization
// BONUS(AO/OPT): Implement multi-document optimization
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

  const project = await findProjectById({
    workspaceId: workspace.id,
    id: optimization.projectId,
  })
  if (!project) {
    return Result.error(new NotFoundError('Project not found'))
  }

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

  const finding = await findWorkspaceUserById({
    workspaceId: workspace.id,
    id: baselineCommit.userId,
  })
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

  const rowsRepository = new DatasetRowsRepository(workspace.id)
  const trainrows = await rowsRepository.findAllByDataset(trainset.id)
  const testrows = await rowsRepository.findAllByDataset(testset.id)

  const split = Math.floor(testrows.length * OPTIMIZATION_VALSET_SPLIT)
  const valrows = testrows.sort(() => Math.random() - 0.5).slice(split)

  const optimize = OPTIMIZATION_ENGINES[optimization.engine]
  if (!optimize) {
    return Result.error(
      new UnprocessableEntityError(
        `Cannot execute an optimization with unknown engine: ${optimization.engine}`,
      ),
    )
  }

  // BONUS(AO/OPT): Implement checkpointing saving for fault tolerance (in gepa run_dir can be used)
  const optimizing = await optimize({
    evaluate: await evaluateFactory({
      evaluation: evaluation,
      trainset: trainset,
      valset: testset,
      optimization: optimization,
      document: document,
      commit: baselineCommit,
      workspace: workspace as WorkspaceDto,
    }),
    propose: await proposeFactory({
      optimization: optimization,
      document: document,
      commit: baselineCommit,
      workspace: workspace,
    }),
    evaluation: evaluation,
    trainset: trainrows,
    valset: valrows,
    optimization: optimization,
    document: document,
    commit: baselineCommit,
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

      const optimizedCommit = await forkCommit(
        {
          commit: baselineCommit,
          data: {
            title: `Optimized ${document.path.split('/').pop()} #${optimization.uuid.slice(0, 8)}`,
            description: 'Created by an optimization.',
          },
          project: project,
          user: author,
          workspace: workspace,
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
