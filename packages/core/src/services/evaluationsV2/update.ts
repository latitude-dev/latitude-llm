import { isEqual } from 'lodash-es'
import {
  AlignmentMetricMetadata,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { assertCanEditCommit } from '../../lib/assertCanEditCommit'
import { compactObject } from '../../lib/compactObject'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  IssuesRepository,
} from '../../repositories'
import { findProjectById } from '../../queries/projects/findById'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { maybeEnqueueAlignmentRecalculation } from './enqueueAlignmentRecalculation'
import { syncDefaultCompositeTarget } from './sync'
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
    force = false,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
    settings?: Partial<Omit<EvaluationSettings<T, M>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    issueId?: number | null
    alignmentMetricMetadata?: AlignmentMetricMetadata
    force?: boolean
  },
  transaction = new Transaction(),
): Promise<TypedResult<{ evaluation: EvaluationV2<T, M> }>> {
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
      if (settingsChanged && !force) {
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

      if (!force && document.mainEvaluationUuid === evaluation.uuid) {
        return Result.error(
          new BadRequestError('The main evaluation cannot be updated manually'),
        )
      }

      if (!settings) settings = {}
      settings = compactObject(settings)

      if (!options) options = {}
      options = compactObject(options)

      let issue: Issue | null = null
      if (issueId) {
        const issuesRepository = new IssuesRepository(workspace.id, tx)
        const projectResult = await findProjectById({ workspaceId: workspace.id, id: commit.projectId }, tx)
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

      if (issueId !== undefined) {
        // issueId === null means un-assign the issue.
        await syncDefaultCompositeTarget(
          { document, commit, workspace },
          transaction,
        )
      }

      publisher.publishLater({
        type: 'evaluationV2Updated',
        data: {
          evaluation: evaluation,
          workspaceId: workspace.id,
        },
      })

      return Result.ok({ evaluation })
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
