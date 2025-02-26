import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { IntegrationsRepository } from '@latitude-data/core/repositories'

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
      const integrationsScope = new IntegrationsRepository(workspace.id)
      const rows = await integrationsScope.findAll().then((r) => r.unwrap())

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
