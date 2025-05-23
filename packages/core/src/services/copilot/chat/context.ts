import { LatteContext } from '@latitude-data/constants/latte'
import {
  Commit,
  DocumentVersion,
  HEAD_COMMIT,
  Project,
  Workspace,
} from '../../../browser'
import { PromisedResult } from '../../../lib/Transaction'
import { LatitudeError } from '../../../lib/errors'
import { Result, TypedResult } from '../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../../repositories'

export async function getContextString({
  workspace,
  context,
}: {
  workspace: Workspace
  context: LatteContext
}): PromisedResult<string, LatitudeError> {
  try {
    const project = await getProject({
      workspace,
      projectId: context.projectId,
    }).then((r) => r.unwrap())

    const commit = await getCommit({
      workspace,
      project,
      commitUuid: context.commitUuid,
    }).then((r) => r.unwrap())

    const document = await getDocument({
      workspace,
      project,
      commit,
      documentUuid: context.documentUuid,
    }).then((r) => r.unwrap())

    const contextParts = [
      project
        ? `CURRENT PROJECT: ${JSON.stringify({ id: project.id, name: project.name })}`
        : undefined,
      commit
        ? `CURRENT COMMIT: ${JSON.stringify({ uuid: context.commitUuid === HEAD_COMMIT ? HEAD_COMMIT : commit.uuid, title: commit.title, isMerged: !!commit.mergedAt })}`
        : undefined,
      document
        ? `CURRENT DOCUMENT: ${JSON.stringify({ uuid: document.documentUuid, path: document.path })}`
        : undefined,
    ].filter((p) => p !== undefined)

    return Result.ok(
      `
-----BEGIN CONTEXT-----
The user is currently in the Latitude App.
${contextParts.join('\n')}
-----END CONTEXT-----
  `.trim(),
    )
  } catch (err) {
    const error = err as LatitudeError
    return Result.error(error)
  }
}

export async function getProject({
  workspace,
  projectId,
}: {
  workspace: Workspace
  projectId?: number
}): PromisedResult<Project | undefined, LatitudeError> {
  if (!projectId) return Result.nil()
  const projectsScope = new ProjectsRepository(workspace.id)
  const projectResult = await projectsScope.find(projectId)
  return projectResult
}

export async function getCommit({
  workspace,
  project,
  commitUuid,
}: {
  workspace: Workspace
  project?: Project
  commitUuid?: string
}): PromisedResult<Commit | undefined, LatitudeError> {
  if (!commitUuid) return Result.nil()
  if (!project) return Result.nil()
  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId: project.id,
    uuid: commitUuid,
  })
  return commitResult
}

export async function getDocument({
  workspace,
  project,
  commit,
  documentUuid,
}: {
  workspace: Workspace
  project?: Project
  commit?: Commit
  documentUuid?: string
}): PromisedResult<DocumentVersion | undefined, LatitudeError> {
  if (!documentUuid) return Result.nil()
  if (!commit) return Result.nil()
  if (!project) return Result.nil()
  const documentScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentScope.getDocumentAtCommit({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid,
  })
  return documentResult as TypedResult<DocumentVersion, LatitudeError>
}
