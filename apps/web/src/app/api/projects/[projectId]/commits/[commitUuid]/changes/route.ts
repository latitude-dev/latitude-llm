'use server'

import type { Workspace } from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'
import { getCommitChanges } from '@latitude-data/core/services/commits/getChanges'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { projectId: string; commitUuid: string }
        workspace: Workspace
      },
    ) => {
      const projectId = params.projectId
      const commitUuid = params.commitUuid

      if (!projectId || !commitUuid) {
        return NextResponse.json(
          { message: 'Project ID and Commit UUID are required' },
          { status: 400 },
        )
      }

      const commitRepo = new CommitsRepository(workspace.id)
      const commit = await commitRepo
        .getCommitByUuid({ uuid: commitUuid, projectId: Number(projectId) })
        .then((r) => r.unwrap())

      const changes = await getCommitChanges({ commit, workspace }).then((r) => r.unwrap())

      return NextResponse.json(changes, { status: 200 })
    },
  ),
)
