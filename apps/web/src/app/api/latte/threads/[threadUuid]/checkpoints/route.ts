import { NextRequest } from 'next/server'

import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { LatteThreadsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/browser'

export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        workspace,
        params,
      }: { workspace: Workspace; params: { threadUuid: string } },
    ) => {
      const { threadUuid } = params
      const commitId = req.nextUrl.searchParams.get('commitId') || undefined
      const latteThreadRepository = new LatteThreadsRepository(workspace.id)
      const checkpoints = await latteThreadRepository.findCheckpointsByCommit({
        threadUuid,
        commitId: commitId ? Number(commitId) : undefined,
      })

      return Response.json(checkpoints || [])
    },
  ),
)
