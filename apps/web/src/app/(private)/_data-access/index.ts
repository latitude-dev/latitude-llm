import { cache } from 'react'

import { type Commit } from '@latitude-data/core/browser'
import { findAllEvaluationTemplates } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  ConnectedEvaluationsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  EvaluationsRepository,
  ProjectsRepository,
  ProviderLogsRepository,
} from '@latitude-data/core/repositories/index'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'

export const getFirstProjectCached = cache(
  async ({ workspaceId }: { workspaceId: number }) => {
    const projectsScope = new ProjectsRepository(workspaceId)
    const result = await projectsScope.getFirstProject()
    const project = result.unwrap()

    return project
  },
)

export const getActiveProjectsCached = cache(
  async ({ workspaceId }: { workspaceId: number }) => {
    const projectsScope = new ProjectsRepository(workspaceId)
    const result = await projectsScope.findAllActive()
    const projects = result.unwrap()

    return projects
  },
)

export const findProjectCached = cache(
  async ({
    projectId,
    workspaceId,
  }: {
    projectId: number
    workspaceId: number
  }) => {
    const projectsScope = new ProjectsRepository(workspaceId)
    const result = await projectsScope.getProjectById(projectId)
    const project = result.unwrap()

    return project
  },
)

export const findCommitCached = cache(
  async ({ uuid, projectId }: { uuid: string; projectId: number }) => {
    const { workspace } = await getCurrentUser()
    const commitsScope = new CommitsRepository(workspace.id)
    const result = await commitsScope.getCommitByUuid({ projectId, uuid })
    const commit = result.unwrap()

    return commit
  },
)

export const getDocumentByUuidCached = cache(
  async ({
    projectId,
    documentUuid,
    commitUuid,
  }: {
    projectId: number
    documentUuid: string
    commitUuid: string
  }) => {
    const { workspace } = await getCurrentUser()
    const scope = new DocumentVersionsRepository(workspace.id)
    const result = await scope.getDocumentAtCommit({
      documentUuid,
      commitUuid,
      projectId,
    })
    if (result.error) {
      const error = result.error
      if (error instanceof NotFoundError) {
        return notFound()
      }

      throw error
    }

    return result.unwrap()
  },
)

export const getDocumentByPathCached = cache(
  async ({ commit, path }: { commit: Commit; path: string }) => {
    const { workspace } = await getCurrentUser()
    const docsScope = new DocumentVersionsRepository(workspace!.id)
    const documents = await docsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    const document = documents.find((d) => d.path === path)
    if (!document) throw new NotFoundError('Document not found')

    return document
  },
)

export const getDocumentsAtCommitCached = cache(
  async ({ commit }: { commit: Commit }) => {
    const { workspace } = await getCurrentUser()
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const result = await docsScope.getDocumentsAtCommit(commit)
    const documents = result.unwrap()

    return documents
  },
)

export const getDocumentByIdCached = cache(async (id: number) => {
  const { workspace } = await getCurrentUser()
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const result = await docsScope.getDocumentById(id)
  const document = result.unwrap()

  return document
})

export const getDocumentLogsWithMetadataCached = cache(
  async ({
    documentUuid,
    commit,
  }: {
    documentUuid: string
    commit: Commit
  }) => {
    const { workspace } = await getCurrentUser()
    const docsScope = new DocumentLogsRepository(workspace.id)
    const result = await docsScope.getDocumentLogsWithMetadata({
      documentUuid,
      draft: commit,
    })
    const logs = result.unwrap()

    return logs
  },
)

export const getDocumentsFromMergedCommitsCache = cache(
  async (workspaceId: number) => {
    const docsScope = new DocumentVersionsRepository(workspaceId)
    const result = await docsScope.getDocumentsFromMergedCommits()
    const documents = result.unwrap()

    return documents
  },
)

export const getEvaluationTemplatesCached = cache(async () => {
  const result = await findAllEvaluationTemplates()
  const templates = result.unwrap()

  return templates
})

export const getEvaluationByUuidCached = cache(async (uuid: string) => {
  const { workspace } = await getCurrentUser()
  const evaluationScope = new EvaluationsRepository(workspace.id)
  const result = await evaluationScope.findByUuid(uuid)
  const evaluation = result.unwrap()

  return evaluation
})

export const getProviderLogCached = cache(async (uuid: string) => {
  const { workspace } = await getCurrentUser()
  const scope = new ProviderLogsRepository(workspace.id)
  return await scope.findByUuid(uuid).then((r) => r.unwrap())
})

export const getEvaluationsByDocumentUuidCached = cache(
  async (documentUuid: string) => {
    const { workspace } = await getCurrentUser()
    const scope = new EvaluationsRepository(workspace.id)
    const result = await scope.findByDocumentUuid(documentUuid)
    return result.unwrap()
  },
)

export const getConnectedDocumentsWithMetadataCached = cache(
  async (evaluationId: number) => {
    const { workspace } = await getCurrentUser()
    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      workspace.id,
    )
    const result =
      await connectedEvaluationsScope.getConnectedDocumentsWithMetadata(
        evaluationId,
      )
    return result.unwrap()
  },
)
