import { cache } from 'react'

import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { cache as redis } from '@latitude-data/core/cache'
import {
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  LAST_LATTE_THREAD_CACHE_KEY,
} from '@latitude-data/core/constants'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  EvaluationsV2Repository,
  OptimizationsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories/index'
import { findAllActiveProjects } from '@latitude-data/core/queries/projects/findAllActive'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { notFound } from 'next/navigation'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const getActiveProjectsCached = cache(
  async ({ workspaceId }: { workspaceId: number }) => {
    return await findAllActiveProjects({ workspaceId })
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
    const project = await findProjectById({ workspaceId, id: projectId })
    if (!project) throw new NotFoundError('Project not found')

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
    const project = await findProjectById({
      workspaceId: workspace.id,
      id: projectId,
    })
    if (!project) throw new NotFoundError('Project not found')
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

export const listOptimizationsByDocumentCached = cache(
  async ({
    documentUuid,
    page,
    pageSize,
  }: {
    documentUuid: string
    page?: number
    pageSize?: number
  }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new OptimizationsRepository(workspace.id)
    const optimizations = await repository
      .listByDocumentWithDetails({ documentUuid, page, pageSize })
      .then((r) => r.unwrap())

    return optimizations
  },
)

export const positionOptimizationByDocumentCached = cache(
  async ({
    optimizationUuid,
    documentUuid,
    pageSize,
  }: {
    optimizationUuid: string
    documentUuid: string
    pageSize?: number
  }) => {
    const { workspace } = await getCurrentUserOrRedirect()
    const repository = new OptimizationsRepository(workspace.id)
    const position = await repository
      .positionByDocument({ optimizationUuid, documentUuid, pageSize })
      .then((r) => r.unwrap())

    return position
  },
)

export const getApiKeysCached = cache(async () => {
  const { workspace } = await getCurrentUserOrRedirect()
  const scope = new ApiKeysRepository(workspace.id)
  const result = await scope.findAll()
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
