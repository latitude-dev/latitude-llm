import { ApiKeysRepository } from '@latitude-data/core/repositories/apiKeysRepository'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { Workspace } from '@latitude-data/core/schema/types'

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
      const apiKeysScope = new ApiKeysRepository(workspace.id)
      const rows = await apiKeysScope.findAll().then((r) => r.unwrap())

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
