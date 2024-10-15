import { Workspace } from '@latitude-data/core/browser'
import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _req: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const evaluationsScope = new EvaluationsRepository(workspace.id)
      const result = await evaluationsScope.findAll()
      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
