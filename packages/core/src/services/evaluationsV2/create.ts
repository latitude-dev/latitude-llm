import {
  EVALUATION_SPECIFICATIONS,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { compactObject } from '../../lib/compactObject'
import { BadRequestError, NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findProjectById } from '../../queries/projects/findById'
import { findIssueById } from '../../queries/issues/findById'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Issue } from '../../schema/models/types/Issue'
import { type Workspace } from '../../schema/models/types/Workspace'
import { syncDefaultCompositeTarget } from './sync'
import { validateEvaluationV2 } from './validate'

export async function createEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    document,
    commit,
    settings,
    options,
    issueId,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    settings: EvaluationSettings<T, M>
    options?: Partial<EvaluationOptions>
    issueId?: number | null
    workspace: Workspace
  },
  transaction = new Transaction(),
): Promise<TypedResult<{ evaluation: EvaluationV2<T, M> }>> {
  const typeSpec = EVALUATION_SPECIFICATIONS[settings.type]
  const metrics = typeSpec?.metrics as Record<
    string,
    { requiresExpectedOutput?: boolean }
  >
  const metricSpec = metrics?.[settings.metric]
  if (metricSpec?.requiresExpectedOutput && !workspace.promptManagerEnabled) {
    return Result.error(
      new BadRequestError(
        'This evaluation type requires expected output. Expected output is matched from dataset columns to prompt parameters, and parameters can only be defined when Prompt Manager is enabled.',
      ),
    )
  }

  return await transaction.call(async (tx) => {
    if (!options) options = {}
    options = compactObject(options)

    let issue: Issue | null = null
    if (issueId) {
      const project = await findProjectById(
        { workspaceId: workspace.id, id: commit.projectId },
        tx,
      )
      if (!project) {
        return Result.error(new NotFoundError('Project not found'))
      }
      issue =
        (await findIssueById(
          { workspaceId: workspace.id, issueId, project },
          tx,
        )) ?? null
      if (!issue) {
        return Result.error(new BadRequestError('Issue not found'))
      }
    }

    const validation = await validateEvaluationV2(
      {
        mode: 'create',
        settings,
        options,
        document,
        commit,
        workspace,
        issue,
      },
      tx,
    )
    if (validation.error) {
      return Result.error(validation.error)
    }
    settings = validation.value.settings
    options = validation.value.options

    const result = await tx
      .insert(evaluationVersions)
      .values({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        issueId,
        ...settings,
        ...options,
      })
      .returning()
      .then((r) => r[0]!)

    const evaluation = {
      ...result,
      uuid: result.evaluationUuid,
      versionId: result.id,
    } as unknown as EvaluationV2<T, M>

    if (issueId !== undefined) {
      // Note: failing silently.
      // We don't want to block evaluation creation
      await syncDefaultCompositeTarget(
        { document, commit, workspace },
        transaction,
      )
    }

    await publisher.publishLater({
      type: 'evaluationV2Created',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  })
}
