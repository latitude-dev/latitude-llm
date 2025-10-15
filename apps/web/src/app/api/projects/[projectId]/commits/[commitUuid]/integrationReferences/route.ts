import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import {
  CommitsRepository,
  DocumentIntegrationReferencesRepository,
} from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

export const GET = errorHandler(
  authHandler(
    async (
      _request: NextRequest,
      {
        params: { commitUuid, projectId: _projectId },
        workspace,
      }: {
        params: { commitUuid: string; projectId: string }
        workspace: Workspace
      },
    ) => {
      const projectId = parseInt(_projectId)

      const commitsRepo = new CommitsRepository(workspace.id)
      const commit = await commitsRepo
        .getCommitByUuid({
          projectId,
          uuid: commitUuid,
        })
        .then((r) => r.unwrap())

      const referencesScope = new DocumentIntegrationReferencesRepository(
        workspace.id,
      )

      const result = await referencesScope.getActiveInCommit(commit)
      return NextResponse.json(result, { status: 200 })
    },
  ),
)
