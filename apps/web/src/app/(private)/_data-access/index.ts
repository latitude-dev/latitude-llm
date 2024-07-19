import { cache } from 'react'

import {
  findCommitByUuid as originalfindCommit,
  findProject as originalFindProject,
  getFirstProject as originalGetFirstProject,
  type FindCommitByUuidProps,
  type FindProjectProps,
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
