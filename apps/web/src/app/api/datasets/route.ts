import { Workspace } from '@latitude-data/core/browser'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const scope = new DatasetsRepository(workspace.id)
      const rows = await scope.findAll().then((r) => r.unwrap())

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
