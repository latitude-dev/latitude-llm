import { isEqual } from 'lodash-es'
import {
  AlignmentMetricMetadata,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  LlmEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { compactObject } from '../../lib/compactObject'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  IssuesRepository,
  ProjectsRepository,
} from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { and, eq } from 'drizzle-orm'
import { syncDefaultCompositeTarget } from './create'
import { generateConfigurationHash } from './generateConfigurationHash'
import { validateEvaluationV2 } from './validate'

export async function updateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    settings,
    options,
    issueId,
    workspace,
    alignmentMetricMetadata,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
    settings?: Partial<Omit<EvaluationSettings<T, M>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    issueId?: number | null
    alignmentMetricMetadata?: AlignmentMetricMetadata
  },
  transaction = new Transaction(),
) {
  const originalEvaluation = evaluation
  return await transaction.call(
    async (tx) => {
      let settingsChanged = false
      for (const setting in settings ?? {}) {
        const key = setting as keyof typeof settings
        if (!isEqual(settings?.[key], evaluation[key])) {
          settingsChanged = true
          break
        }
      }
      if (settingsChanged) {
        await assertCanEditCommit(commit, tx).then((r) => r.unwrap())
      }

      const documentsRepository = new DocumentVersionsRepository(
        workspace.id,
        tx,
      )
      const document = await documentsRepository
        .getDocumentAtCommit({
          commitUuid: commit.uuid,
          documentUuid: evaluation.documentUuid,
        })
        .then((r) => r.unwrap())

      if (!settings) settings = {}
      settings = compactObject(settings)

      if (!options) options = {}
      options = compactObject(options)

      let issue: Issue | null = null
      if (issueId) {
        const issuesRepository = new IssuesRepository(workspace.id, tx)
        const projectRepository = new ProjectsRepository(workspace.id, tx)
        const projectResult = await projectRepository.find(commit.projectId)
        if (!Result.isOk(projectResult)) {
          return projectResult
        }
        const project = projectResult.unwrap()
        issue = await issuesRepository.findById({
          project,
          issueId,
        })
        if (!issue) {
          return Result.error(new BadRequestError('Issue not found'))
        }
      }

      const validating = await validateEvaluationV2(
        {
          mode: 'update',
          evaluation: evaluation,
          settings: { ...evaluation, ...settings },
          options: { ...evaluation, ...options },
          document: document,
          commit: commit,
          workspace: workspace,
          issue: issue,
        },
        tx,
      )
      if (validating.error) return Result.error(validating.error)
      settings = validating.value.settings
      options = validating.value.options

      const result = await tx
        .insert(evaluationVersions)
        .values({
          ...evaluation,
          id: undefined,
          commitId: commit.id,
          issueId: issueId !== undefined ? issueId : evaluation.issueId,
          alignmentMetricMetadata,
          ...settings,
          ...options,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            evaluationVersions.commitId,
            evaluationVersions.evaluationUuid,
          ],
          set: {
            ...settings,
            ...options,
            updatedAt: new Date(),
            issueId: issueId !== undefined ? issueId : evaluation.issueId,
            alignmentMetricMetadata,
          },
        })
        .returning()
        .then((r) => r[0]!)

      evaluation = {
        ...result,
        uuid: result.evaluationUuid,
        versionId: result.id,
      } as unknown as EvaluationV2<T, M>

      let target = undefined
      if (issueId !== undefined) {
        const syncing = await syncDefaultCompositeTarget(
          { evaluation, issue, document, commit, workspace }, // prettier-ignore
          transaction,
        )
        // Note: failing silently
        target = syncing.value
      }

      publisher.publishLater({
        type: 'evaluationV2Updated',
        data: {
          evaluation: evaluation,
          workspaceId: workspace.id,
        },
      })

      return Result.ok({ evaluation, target })
    },
    async ({ evaluation }) => {
      await maybeEnqueueAlignmentRecalculation({
        oldEvaluation: originalEvaluation,
        newEvaluation: evaluation,
        commit,
      })
    },
  )
}

async function maybeEnqueueAlignmentRecalculation<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  oldEvaluation,
  newEvaluation,
  commit,
}: {
  oldEvaluation: EvaluationV2<T, M>
  newEvaluation: EvaluationV2<T, M>
  commit: Commit
}) {
  const effectiveIssueId = newEvaluation.issueId ?? oldEvaluation.issueId
  if (!effectiveIssueId) return

  if (
    newEvaluation.type !== EvaluationType.Llm ||
    newEvaluation.metric !== LlmEvaluationMetric.Binary
  ) {
    return
  }

  const typedOldEvaluation = oldEvaluation as unknown as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >
  const typedNewEvaluation = newEvaluation as unknown as EvaluationV2<
    EvaluationType.Llm,
    LlmEvaluationMetric.Binary
  >

  const oldHash = generateConfigurationHash(typedOldEvaluation)
  const newHash = generateConfigurationHash(typedNewEvaluation)

  if (oldHash === newHash) return

  const updatedAlignmentMetricMetadata: AlignmentMetricMetadata = {
    alignmentHash:
      typedNewEvaluation.alignmentMetricMetadata?.alignmentHash ?? '',
    confusionMatrix: typedNewEvaluation.alignmentMetricMetadata
      ?.confusionMatrix ?? {
      truePositives: 0,
      trueNegatives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    },
    lastProcessedPositiveSpanDate:
      typedNewEvaluation.alignmentMetricMetadata?.lastProcessedPositiveSpanDate,
    lastProcessedNegativeSpanDate:
      typedNewEvaluation.alignmentMetricMetadata?.lastProcessedNegativeSpanDate,
    recalculatingAt: Date.now().toString(),
  }

  publisher.publishLater({
    type: 'evaluationV2AlignmentUpdated',
    data: {
      workspaceId: newEvaluation.workspaceId,
      evaluationUuid: newEvaluation.uuid,
      alignmentMetricMetadata: updatedAlignmentMetricMetadata,
    },
  })

  console.log('updatedAlignmentMetricMetadata', updatedAlignmentMetricMetadata)

  await database
    .update(evaluationVersions)
    .set({
      alignmentMetricMetadata: updatedAlignmentMetricMetadata,
    })
    .where(
      and(
        eq(evaluationVersions.commitId, commit.id),
        eq(evaluationVersions.evaluationUuid, newEvaluation.uuid),
      ),
    )

  const { maintenanceQueue } = await queues()
  await maintenanceQueue.add(
    'updateEvaluationAlignmentJob',
    {
      workspaceId: newEvaluation.workspaceId,
      commitId: commit.id,
      evaluationUuid: newEvaluation.uuid,
      documentUuid: newEvaluation.documentUuid,
      issueId: effectiveIssueId,
      source: 'configChange' as const,
    },
    { attempts: 1 },
  )

  return
}
