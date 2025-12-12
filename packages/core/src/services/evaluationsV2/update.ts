import { isEqual } from 'lodash-es'
import {
  AlignmentMetricMetadata,
  CompositeEvaluationMetric,
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
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  IssuesRepository,
  ProjectsRepository,
} from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createEvaluationV2 } from './create'
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
    alignmentMetric,
    alignmentMetricMetadata,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
    settings?: Partial<Omit<EvaluationSettings<T, M>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    issueId?: number | null
    alignmentMetric?: number
    alignmentMetricMetadata?: AlignmentMetricMetadata
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
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

    const documentsRepository = new DocumentVersionsRepository(workspace.id, tx)
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
    if (issueId !== undefined && issueId !== null) {
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
        alignmentMetric: alignmentMetric,
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
        alignmentMetric,
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
          alignmentMetric,
          alignmentMetricMetadata,
        },
      })
      .returning()
      .then((r) => r[0]!)

    if (issueId !== undefined) {
      const creating = await createDefaultCompositeTarget(
        { evaluation, issue, document, commit, workspace }, // prettier-ignore
        transaction,
      )
      if (creating.error) {
        return Result.error(creating.error)
      }
    }

    evaluation = {
      ...result,
      uuid: result.evaluationUuid,
      versionId: result.id,
    } as unknown as EvaluationV2<T, M>

    publisher.publishLater({
      type: 'evaluationV2Updated',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  })
}

// TODO(perfeval): create default composite target if it doesn't exist and show a toast notification to the user
// TODO(perfeval): if the default composite target exists show a toast notification to the user to go to the eval and update it
async function createDefaultCompositeTarget<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    issue,
    document,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    issue: Issue | null
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    const repository = new EvaluationsV2Repository(workspace.id, tx)
    let target = await repository
      .getDefaultCompositeTarget({
        projectId: commit.projectId,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    if (!target && !issue) {
      return Result.nil()
    }

    if (!target && issue) {
      const creating = await createEvaluationV2(
        {
          document,
          commit,
          settings: {
            name: 'Performance',
            description: 'Measures the overall performance',
            type: EvaluationType.Composite,
            metric: CompositeEvaluationMetric.Weighted,
            configuration: {
              reverseScale: false,
              actualOutput: {
                messageSelection: 'last',
                parsingFormat: 'string',
              },
              expectedOutput: {
                parsingFormat: 'string',
              },
              evaluationUuids: [evaluation.uuid],
              weights: { [evaluation.uuid]: 100 },
              minThreshold: 75,
              maxThreshold: 0,
              defaultTarget: true,
            },
          },
          options: {
            evaluateLiveLogs: false,
            enableSuggestions: false,
            autoApplySuggestions: false,
          },
          workspace,
        },
        transaction,
      )
      if (creating.error) {
        return Result.error(creating.error)
      }

      target = creating.value.evaluation
    }

    return Result.ok(target)
  })
}
