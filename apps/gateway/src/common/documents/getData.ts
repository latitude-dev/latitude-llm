import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '@latitude-data/core/lib/Result'
import { validate as isValidUuid } from 'uuid'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProviderApiKeysRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { Providers } from '@latitude-data/constants'
import { getDocumentMetadata } from '@latitude-data/core/services/documents/scan'
import { documentPresenterWithProviderAndMetadata } from '$/presenters/documentPresenter'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

async function getProjectByVersionData({
  workspace,
  projectId,
  commitUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
}) {
  const commitsScope = new CommitsRepository(workspace.id)

  const pid = Number(projectId)
  if (isNaN(pid)) {
    return Result.error(new BadRequestError(`Invalid project id ${projectId}`))
  }

  const project = await findProjectById({ workspaceId: workspace.id, id: pid })
  if (!project) {
    return Result.error(new NotFoundError('Project not found'))
  }

  // 'live' is accepted in some routes as a special identifier.
  // Anything else must be a UUID to avoid Drizzle/pg throwing on malformed values.
  if (commitUuid !== 'live' && !isValidUuid(commitUuid)) {
    return Result.error(
      new BadRequestError(`Invalid version uuid ${commitUuid}`),
    )
  }

  const commitResult = await commitsScope.getCommitByUuid({
    projectId: project.id,
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.value
  return Result.ok({ project, commit })
}

export async function getAllDocumentsAtCommitWithMetadata({
  workspace,
  projectId,
  commitUuid,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
}) {
  const projectResult = await getProjectByVersionData({
    workspace,
    projectId,
    commitUuid,
  })

  if (projectResult.error) return projectResult

  const { commit } = projectResult.value
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const docsResult = await docsScope.getDocumentsAtCommit(commit)
  if (docsResult.error) return docsResult

  const docs = docsResult.value
  const docsWithMetadata = await Promise.all(
    docs.map(async (document) => {
      const metadata = await getDocumentMetadata({
        document,
        getDocumentByPath: async (path) => docs.find((d) => d.path === path),
      })
      return {
        document,
        metadata,
      }
    }),
  )

  const providerNames = docsWithMetadata
    .map((d) => d.metadata?.config?.provider as string)
    .filter((providerName) => !!providerName)
  const providersScope = new ProviderApiKeysRepository(workspace.id)
  const allUsedProviders = await providersScope.findAllByNames(providerNames)
  const llmProviders = allUsedProviders.reduce(
    (acc, provider) => {
      acc[provider.name] = provider.provider
      return acc
    },
    {} as Record<string, Providers>,
  )

  return Result.ok(
    docs.map((document) => {
      const doc = docsWithMetadata.find(
        (d) => d.document.documentUuid === document.documentUuid,
      )
      const provider = doc?.metadata?.config?.provider
      return documentPresenterWithProviderAndMetadata({
        document,
        metadata: doc?.metadata,
        provider: llmProviders[provider as string],
        commit,
      })
    }),
  )
}

export const getData = async ({
  workspace,
  projectId,
  commitUuid,
  documentPath,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
  documentPath: string
}) => {
  const projectResult = await getProjectByVersionData({
    workspace,
    projectId,
    commitUuid,
  })

  if (projectResult.error) return projectResult

  const { project, commit } = projectResult.value
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await docsScope.getDocumentByPath({
    commit,
    path: documentPath,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  return Result.ok({ project, commit, document })
}
