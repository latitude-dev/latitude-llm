import { omit } from 'lodash-es'
import {
  ATTRIBUTES,
  HEAD_COMMIT,
  LogSources,
  SpanAttribute,
} from '../../../../constants'
import { NotFoundError } from '../../../../lib/errors'
import { generateUUIDIdentifier } from '../../../../lib/generateUUID'
import { Result, TypedResult } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { findProjectById } from '../../../../queries/projects/findById'
import { findFirstUserInWorkspace } from '../../../../queries/users/findFirstInWorkspace'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { Commit } from '../../../../schema/models/types/Commit'
import { DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { createCommit, mergeCommit } from '../../../commits'
import { createNewDocument } from '../../../documents'

type ResolveCaptureAttributesArgs = {
  attributes: Record<string, SpanAttribute>
  workspace: Workspace
  apiSource?: LogSources
}

async function getResolvedData({
  path,
  commit,
  workspace,
  isHead,
}: {
  path: string
  commit: Commit
  workspace: Workspace
  isHead: boolean
}): PromisedResult<{ documentVersion: DocumentVersion; commit: Commit }> {
  const commitsRepo = new CommitsRepository(workspace.id)
  const docsRepo = new DocumentVersionsRepository(workspace.id)

  const docsResult = await docsRepo.getDocumentsAtCommit(commit)
  if (!Result.isOk(docsResult)) return docsResult

  const docs = docsResult.unwrap()
  const doc = docs.find((d) => d.path === path)
  if (doc) return Result.ok({ documentVersion: doc, commit })

  if (!commit.mergedAt) {
    const newDocResult = await createNewDocument({
      workspace,
      path,
      commit,
      content: '',
      includeDefaultContent: false,
      onConflictDoNothing: true,
    })
    if (!Result.isOk(newDocResult)) return newDocResult

    return Result.ok({ documentVersion: newDocResult.unwrap(), commit })
  }

  if (isHead) {
    const project = await findProjectById({
      workspaceId: workspace.id,
      id: commit.projectId,
    })
    if (!project) return Result.error(new NotFoundError('Project not found'))

    const newDraftResult = await createCommit({
      project,
      user: await findFirstUserInWorkspace({ workspaceId: workspace.id }),
      data: { title: `Generated prompt from telemetry: '${path}'` },
    })
    if (!Result.isOk(newDraftResult)) return newDraftResult

    const newDraft = newDraftResult.unwrap()
    const newDocResult = await createNewDocument({
      workspace,
      path,
      commit: newDraft,
      content: '',
      includeDefaultContent: false,
      onConflictDoNothing: true,
    })
    if (!Result.isOk(newDocResult)) return newDocResult

    const newCommitResult = await mergeCommit(newDraft)
    if (!Result.isOk(newCommitResult)) return newCommitResult

    return Result.ok({
      documentVersion: newDocResult.unwrap(),
      commit: newCommitResult.unwrap(),
    })
  }

  const headCommitResult = await commitsRepo.getCommitByUuid({
    uuid: HEAD_COMMIT,
    projectId: commit.projectId,
  })
  if (!Result.isOk(headCommitResult)) return headCommitResult

  return getResolvedData({
    path,
    commit: headCommitResult.unwrap(),
    workspace,
    isHead: true,
  })
}

/**
 * Resolves capture path/project references into concrete prompt/commit/log
 * attributes and creates missing prompt/version records when needed.
 */
export async function resolveCaptureAttributes({
  attributes,
  workspace,
  apiSource = LogSources.API,
}: ResolveCaptureAttributesArgs): Promise<
  TypedResult<Record<string, SpanAttribute>>
> {
  const promptPath = attributes[ATTRIBUTES.LATITUDE.promptPath] as string
  const projectId = Number(attributes[ATTRIBUTES.LATITUDE.projectId])
  if (!Number.isFinite(projectId)) {
    return Result.error(new NotFoundError('Project not found'))
  }

  const versionUuid = attributes[ATTRIBUTES.LATITUDE.commitUuid] as
    | string
    | undefined
  const commitsRepo = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepo.getCommitByUuid({
    uuid: versionUuid ?? HEAD_COMMIT,
    projectId,
    includeInitialDraft: true,
  })
  if (!Result.isOk(commitResult)) return commitResult

  const resolvedData = await getResolvedData({
    path: promptPath,
    commit: commitResult.unwrap(),
    isHead: versionUuid === undefined || versionUuid === HEAD_COMMIT,
    workspace,
  })
  if (!Result.isOk(resolvedData)) return resolvedData

  const { documentVersion, commit } = resolvedData.unwrap()
  const existingDocumentLogUuid = attributes[
    ATTRIBUTES.LATITUDE.documentLogUuid
  ] as string | undefined

  return Result.ok({
    ...omit(attributes, [
      ATTRIBUTES.LATITUDE.promptPath,
      ATTRIBUTES.LATITUDE.commitUuid,
    ]),
    [ATTRIBUTES.LATITUDE.documentUuid]: documentVersion.documentUuid,
    [ATTRIBUTES.LATITUDE.documentLogUuid]:
      existingDocumentLogUuid ?? generateUUIDIdentifier(),
    [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
    [ATTRIBUTES.LATITUDE.source]: apiSource,
  })
}
