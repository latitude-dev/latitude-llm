import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Workspace } from '@latitude-data/core/browser'
import { DatasetsRepository } from '@latitude-data/core/repositories'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
        workspace,
      }: {
        params: { id: string }
        workspace: Workspace
      },
    ) => {
      const { id } = params
      const scope = new DatasetsRepository(workspace.id)
      const dataset = await scope.find(id).then((r) => r.unwrap())

      return NextResponse.json(dataset, { status: 200 })
    },
  ),
)
