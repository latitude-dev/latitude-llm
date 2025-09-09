import { Workspace } from '@latitude-data/core/browser'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { PromocodesRepository } from '@latitude-data/core/repositories/promocodesRepository'

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
      const scope = new PromocodesRepository(workspace.id)
      const promocodes = await scope.findClaimedPromocodes()

      return NextResponse.json(promocodes.unwrap(), { status: 200 })
    },
  ),
)
