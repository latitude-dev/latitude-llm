import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { ExperimentsRepository } from '@latitude-data/core/repositories'
import { parseApiExperimentsParams } from '@latitude-data/core/data-access/experiments/parseApiExperimentsFilterParams'

import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
export const GET = errorHandler(
  authHandler(
    async (
      req: NextRequest,
      {
        params: { projectId, documentUuid },
        workspace,
      }: {
        params: { projectId: string; documentUuid: string }
        workspace: Workspace
      },
    ) => {
      const searchParams = req.nextUrl.searchParams
      const { page, pageSize } = parseApiExperimentsParams({ searchParams })

      const scope = new ExperimentsRepository(workspace.id)
      const experiments = await scope.findByDocumentUuid({
        projectId: Number(projectId),
        documentUuid,
        page: +page,
        pageSize: +pageSize,
      })

      return NextResponse.json(experiments, { status: 200 })
    },
  ),
)
