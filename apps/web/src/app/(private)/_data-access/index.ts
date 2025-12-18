import { cache } from 'react'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { cache as redis } from '@latitude-data/core/cache'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import {
  CommitsRepository,
  DocumentLogsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  ProjectsRepository,
  ProviderApiKeysRepository,
  ProviderLogsRepository,
} from '@latitude-data/core/repositories/index'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { notFound } from 'next/navigation'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  LAST_LATTE_THREAD_CACHE_KEY,
} from '@latitude-data/core/constants'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

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
    const { workspace } = await getCurrentUserOrRedirect()
    if (!workspace) return notFound()

    const commitsScope = new CommitsRepository(workspace.id)
    const result = await commitsScope.getCommitByUuid({ projectId, uuid })
    const commit = result.unwrap()

    return commit
  },
)

export const findCommitsByProjectCached = cache(
  async ({ projectId }: { projectId: number }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const commitsScope = new CommitsRepository(workspace.id)
    const result = await commitsScope.filterByProject(projectId)
    const commits = result.unwrap()

    return commits
  },
)

export const findCommitsWithDocumentChangesCached = cache(
  async ({
    projectId,
    documentUuid,
  }: {
    projectId: number
    documentUuid: string
  }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const projectsScope = new ProjectsRepository(workspace.id)
    const project = await projectsScope
      .getProjectById(projectId)
      .then((r) => r.unwrap())
    const commitsScope = new CommitsRepository(workspace.id)
    const commits = await commitsScope.getCommitsWithDocumentChanges({
      project,
      documentUuid,
    })

    return commits
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
    const { workspace } = await getCurrentUserOrRedirect()
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
    const { workspace } = await getCurrentUserOrRedirect()
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
    const { workspace } = await getCurrentUserOrRedirect()
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const result = await docsScope.getDocumentsAtCommit(commit)
    const documents = result.unwrap()

    return documents
  },
)

export const getHeadCommitCached = cache(
  async ({
    workspace,
    projectId,
  }: {
    workspace: Workspace
    projectId: number
  }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    return await commitsScope.getHeadCommit(projectId)
  },
)

export const getDocumentByIdCached = cache(async (id: number) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const result = await docsScope.getDocumentById(id)
  const document = result.unwrap()

  return document
})

export const getDocumentsFromMergedCommitsCache = cache(
  async (workspaceId: number) => {
    const docsScope = new DocumentVersionsRepository(workspaceId)
    const result = await docsScope.getDocumentsFromMergedCommits()
    const documents = result.unwrap()

    return documents
  },
)

export const getDocumentLogsApproximatedCountCached = cache(
  async (documentUuid: string) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new DocumentLogsRepository(workspace.id)
    return await repository
      .approximatedCount({ documentUuid })
      .then((r) => r.unwrap())
  },
)

export const getDocumentLogsApproximatedCountByProjectCached = cache(
  async (projectId: number) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new DocumentLogsRepository(workspace.id)
    return await repository
      .approximatedCountByProject({ projectId })
      .then((r) => r.unwrap())
  },
)

export const hasDocumentLogsCached = cache(async (documentUuid: string) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const repository = new DocumentLogsRepository(workspace.id)
  return await repository.hasLogs({ documentUuid }).then((r) => r.unwrap())
})

export const hasDocumentLogsByProjectCached = cache(
  async (projectId: number) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new DocumentLogsRepository(workspace.id)
    return await repository
      .hasLogsByProject({ projectId })
      .then((r) => r.unwrap())
  },
)

export const getDocumentLogCached = cache(async (uuid: string) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const repository = new DocumentLogsRepository(workspace.id)
  return await repository.findByUuid(uuid).then((r) => r.unwrap())
})

export const getProviderLogCached = cache(async (uuid: string) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ProviderLogsRepository(workspace.id)
  return await scope.findByUuid(uuid).then((r) => r.unwrap())
})

export const getEvaluationV2AtCommitByDocumentCached = cache(
  async <
    T extends EvaluationType = EvaluationType,
    M extends EvaluationMetric<T> = EvaluationMetric<T>,
  >({
    projectId,
    commitUuid,
    documentUuid,
    evaluationUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
    evaluationUuid: string
  }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new EvaluationsV2Repository(workspace.id)
    const result = await repository.getAtCommitByDocument({
      projectId: projectId,
      commitUuid: commitUuid,
      documentUuid: documentUuid,
      evaluationUuid: evaluationUuid,
    })
    if (result.error) {
      if (result.error instanceof NotFoundError) return notFound()
      throw result.error
    }

    return result.unwrap() as EvaluationV2<T, M>
  },
)

export const listEvaluationsV2AtCommitByDocumentCached = cache(
  async ({
    projectId,
    commitUuid,
    documentUuid,
  }: {
    projectId?: number
    commitUuid: string
    documentUuid: string
  }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new EvaluationsV2Repository(workspace.id)
    const evaluations = await repository
      .listAtCommitByDocument({
        projectId: projectId,
        commitUuid: commitUuid,
        documentUuid: documentUuid,
      })
      .then((r) => r.unwrap())

    return evaluations
  },
)

export const getApiKeysCached = cache(async () => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ApiKeysRepository(workspace.id)
  const result = await scope.findAll()
  return result.unwrap()
})

export const getProviderApiKeyByNameCached = cache(async (name: string) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ProviderApiKeysRepository(workspace.id)
  const result = await scope.findByName(name)
  return result.unwrap()
})

export const getProviderApiKeyByIdCached = cache(async (id: number) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ProviderApiKeysRepository(workspace.id)
  const result = await scope.find(id)
  return result.unwrap()
})

export const getProviderApiKeysCached = cache(async () => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ProviderApiKeysRepository(workspace.id)
  const result = await scope.findAll()
  return result.unwrap()
})

export const isFeatureEnabledCached = cache(async (feature: string) => {
  const { workspace } = await getCurrentUserOrRedirect()
  const enabled = await isFeatureEnabledByName(workspace.id, feature).then(
    (r) => r.unwrap(),
  )

  return enabled
})

export const getLastLatteThreadUuidCached = async ({
  projectId,
}: {
  projectId: number
}) => {
  const { workspace, user } = await getCurrentUserOrRedirect()
  const client = await redis()
  const key = LAST_LATTE_THREAD_CACHE_KEY(workspace.id, user.id, projectId)
  const uuid = await client.get(key)
  return uuid || undefined
}
