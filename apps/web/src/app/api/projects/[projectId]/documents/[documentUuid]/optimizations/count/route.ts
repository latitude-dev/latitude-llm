import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { OptimizationsRepository } from '@latitude-data/core/repositories'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params: { documentUuid },
        workspace,
      }: {
        params: { documentUuid: string }
        workspace: Workspace
      },
    ) => {
      const repository = new OptimizationsRepository(workspace.id)
      const count = await repository
        .countByDocument({ documentUuid })
        .then((r) => r.unwrap())

      return NextResponse.json(count, { status: 200 })
    },
  ),
)
