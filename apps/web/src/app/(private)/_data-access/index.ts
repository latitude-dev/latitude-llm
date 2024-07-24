import { cache } from 'react'

import {
  getDocumentAtCommit,
  NotFoundError,
  findCommitByUuid as originalfindCommit,
  findProject as originalFindProject,
  getDocumentsAtCommit as originalGetDocumentsAtCommit,
  getFirstProject as originalGetFirstProject,
  type FindCommitByUuidProps,
  type FindProjectProps,
  type GetDocumentAtCommitProps,
} from '@latitude-data/core'

export const getFirstProject = cache(
  async ({ workspaceId }: { workspaceId: number }) => {
    const result = await originalGetFirstProject({ workspaceId })
    const project = result.unwrap()

    return project
  },
)

export const findProject = cache(
  async ({ projectId, workspaceId }: FindProjectProps) => {
    const result = await originalFindProject({ projectId, workspaceId })
    const project = result.unwrap()

    return project
  },
)

export const findCommit = cache(
  async ({ uuid, projectId }: FindCommitByUuidProps) => {
    const result = await originalfindCommit({ uuid, projectId })
    const commit = result.unwrap()

    return commit
  },
)

export const getDocumentByUuid = cache(
  async ({ documentUuid, commitId }: GetDocumentAtCommitProps) => {
    const result = await getDocumentAtCommit({ documentUuid, commitId })
    const document = result.unwrap()

    return document
  },
)

export const getDocumentByPath = cache(
  async ({ commitId, path }: { commitId: number; path: string }) => {
    const documents = (
      await originalGetDocumentsAtCommit({ commitId })
    ).unwrap()
    const document = documents.find((d) => d.path === path)
    if (!document) {
      throw new NotFoundError('Document not found')
    }
    return document
  },
)
