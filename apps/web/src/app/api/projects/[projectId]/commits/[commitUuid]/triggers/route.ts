import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  CommitsRepository,
  DocumentTriggersRepository,
} from '@latitude-data/core/repositories'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        params: { projectId: _projectId, commitUuid },
        workspace,
      }: {
        params: { projectId: string; commitUuid: string }
        workspace: Workspace
      },
    ) => {
      const projectId = parseInt(_projectId)
      const { searchParams } = new URL(request.url)
      const documentUuid = searchParams.get('documentUuid')

      const commitsScope = new CommitsRepository(workspace.id)
      const commit = await commitsScope
        .getCommitByUuid({
          uuid: commitUuid,
          projectId,
        })
        .then((r) => r.unwrap())

      const documentTriggersScope = new DocumentTriggersRepository(workspace.id)

      if (documentUuid) {
        const triggers = await documentTriggersScope
          .getTriggersInDocument({ documentUuid, commit })
          .then((r) => r.unwrap())

        return NextResponse.json(triggers, { status: 200 })
      }

      const triggers = await documentTriggersScope
        .getTriggersInProject({ projectId, commit })
        .then((r) => r.unwrap())

      return NextResponse.json(triggers, { status: 200 })
    },
  ),
)
