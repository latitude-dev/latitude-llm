import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { CommitsRepository } from '@latitude-data/core/repositories'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
        params: { commitUuid },
        query: { projectId },
      }: {
        params: { commitUuid: string }
        query: { projectId?: string }
        workspace: Workspace
      },
    ) => {
      const commitsScope = new CommitsRepository(workspace.id)
      const result = await commitsScope.getCommitByUuid({
        uuid: commitUuid,
        projectId: projectId ? Number(projectId) : undefined,
      })
      if (result.error) {
        return NextResponse.json(
          { message: `Commit not found with uuid: ${commitUuid}` },
          { status: 404 },
        )
      }

      return NextResponse.json(result.value, { status: 200 })
    },
  ),
)
