import { isEqual } from 'lodash-es'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { compactObject } from '../../lib/compactObject'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  IssuesRepository,
  ProjectsRepository,
} from '../../repositories'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { validateEvaluationV2 } from './validate'
import { Issue } from '../../schema/models/types/Issue'
import { BadRequestError } from '../../lib/errors'

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
    qualityMetric,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
    settings?: Partial<Omit<EvaluationSettings<T, M>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    issueId?: number | null
    qualityMetric?: number
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
    if (settingsChanged) assertCommitIsDraft(commit).unwrap()

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
        qualityMetric: qualityMetric,
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
        qualityMetric,
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
          qualityMetric,
        },
      })
      .returning()
      .then((r) => r[0]!)

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
