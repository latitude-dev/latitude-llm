import { database } from '../../../../client'
import {
  ExternalSpanMetadata,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  BaseSpanMetadata,
  HEAD_COMMIT,
  ATTRIBUTES,
} from '../../../../constants'
import { Result, TypedResult } from '../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../../../repositories'
import { ExternalSpanSpecification } from './external'
import { SpanBackendSpecification, SpanProcessArgs } from '../shared'
import { DocumentVersion } from '../../../../schema/models/types/DocumentVersion'
import { PromisedResult } from '../../../../lib/Transaction'
import { Workspace } from '../../../../schema/models/types/Workspace'
import { Commit } from '../../../../schema/models/types/Commit'
import { findFirstUserInWorkspace } from '../../../../data-access/users'
import { createNewDocument } from '../../../documents'
import { createCommit, mergeCommit } from '../../../commits'
import { generateUUIDIdentifier } from '../../../../lib/generateUUID'
import { omit } from 'lodash-es'

const specification = SPAN_SPECIFICATIONS[SpanType.UnresolvedExternal]

type ExternalMetadataResult = TypedResult<
  Omit<ExternalSpanMetadata, keyof BaseSpanMetadata>
>

export const UnresolvedExternalSpanSpecification: SpanBackendSpecification<SpanType.UnresolvedExternal> =
  {
    ...specification,
    process:
      process as SpanBackendSpecification<SpanType.UnresolvedExternal>['process'],
  }

async function getResolvedData(
  {
    path,
    commit,
    workspace,
    isHead,
  }: {
    path: string
    commit: Commit
    workspace: Workspace
    isHead: boolean
  },
  db = database,
): PromisedResult<{ documentVersion: DocumentVersion; commit: Commit }> {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const docsRepo = new DocumentVersionsRepository(workspace.id, db)

  // If prompt is found in the commit, return the document version and commit.
  const docsResult = await docsRepo.getDocumentsAtCommit(commit)
  if (!Result.isOk(docsResult)) return docsResult
  const docs = docsResult.unwrap()
  const doc = docs.find((d) => d.path === path)
  if (doc) return Result.ok({ documentVersion: doc, commit })

  // If commit is draft and prompt is not found, create the prompt in the draft.
  if (!commit.mergedAt) {
    const newDocResult = await createNewDocument({
      workspace,
      path,
      commit,
      content: '', // TODO(Telemetry): Add a way to know what prompts are being created from telemetry.
      includeDefaultContent: false,
    })
    if (!Result.isOk(newDocResult)) return newDocResult
    const newDoc = newDocResult.unwrap()
    return Result.ok({ documentVersion: newDoc, commit })
  }

  // If commit is HEAD and prompt is not found, create and merge a new version containing the new prompt.
  if (isHead) {
    const projectRepo = new ProjectsRepository(workspace.id, db)
    const projectResult = await projectRepo.getProjectById(commit.projectId)
    if (!Result.isOk(projectResult)) return projectResult
    const project = projectResult.unwrap()
    const newDraftResult = await createCommit({
      project,
      user: await findFirstUserInWorkspace(workspace),
      data: { title: `Generated prompt from telemetry: '${path}'` },
    })
    if (!Result.isOk(newDraftResult)) return newDraftResult
    const newDraft = newDraftResult.unwrap()
    const newDocResult = await createNewDocument({
      workspace,
      path,
      commit: newDraft,
      content: '', // TODO(Telemetry): Add a way to know what prompts are being created from telemetry.
      includeDefaultContent: false,
    })
    if (!Result.isOk(newDocResult)) return newDocResult
    const newDoc = newDocResult.unwrap()
    const newCommitResult = await mergeCommit(newDraft)
    if (!Result.isOk(newCommitResult)) return newCommitResult
    const newCommit = newCommitResult.unwrap()
    return Result.ok({ documentVersion: newDoc, commit: newCommit })
  }

  // If commit is merged, not HEAD, and prompt is not found, call recursively with the HEAD commit.
  const headCommitResult = await commitsRepo.getCommitByUuid({
    uuid: HEAD_COMMIT,
    projectId: commit.projectId,
  })
  if (!Result.isOk(headCommitResult)) return headCommitResult
  const headCommit = headCommitResult.unwrap()
  return await getResolvedData({
    path,
    commit: headCommit,
    workspace,
    isHead: true,
  })
}

async function process(
  {
    attributes,
    workspace,
    ...rest
  }: SpanProcessArgs<SpanType.UnresolvedExternal>,
  db = database,
): Promise<ExternalMetadataResult> {
  const promptPath = attributes[ATTRIBUTES.LATITUDE.promptPath] as string
  const projectId = attributes[ATTRIBUTES.LATITUDE.projectId] as number
  const versionUuid = attributes[ATTRIBUTES.LATITUDE.commitUuid] as
    | string
    | undefined

  const commitsRepo = new CommitsRepository(workspace.id, db)

  const commitResult = await commitsRepo.getCommitByUuid({
    uuid: versionUuid ?? HEAD_COMMIT,
    projectId,
    includeInitialDraft: true,
  })

  const result = await getResolvedData({
    path: promptPath,
    commit: commitResult.unwrap(),
    isHead: versionUuid === undefined || versionUuid === HEAD_COMMIT,
    workspace,
  })
  if (!Result.isOk(result)) return result
  const { documentVersion, commit } = result.unwrap()

  const existingDocumentLogUuid = attributes[
    ATTRIBUTES.LATITUDE.documentLogUuid
  ] as string | undefined

  const resolvedAttributes = {
    ...omit(attributes, [
      ATTRIBUTES.LATITUDE.promptPath,
      ATTRIBUTES.LATITUDE.projectId,
      ATTRIBUTES.LATITUDE.commitUuid,
    ]),
    [ATTRIBUTES.LATITUDE.documentUuid]: documentVersion.documentUuid,
    [ATTRIBUTES.LATITUDE.documentLogUuid]:
      existingDocumentLogUuid ?? generateUUIDIdentifier(),
    [ATTRIBUTES.LATITUDE.commitUuid]: commit.uuid,
    [ATTRIBUTES.LATITUDE.source]: LogSources.API, // API by default. There is no way to obtain External spans from any other source rn.
  }

  return ExternalSpanSpecification.process(
    {
      attributes: resolvedAttributes,
      workspace,
      ...rest,
    } as SpanProcessArgs<SpanType.External>,
    db,
  )
}
