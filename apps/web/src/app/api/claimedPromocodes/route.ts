import { Workspace } from '@latitude-data/core/browser'
import { ClaimedPromocodesRepository } from '@latitude-data/core/repositories/claimedPromocodesRepository'
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
      const scope = new ClaimedPromocodesRepository(workspace.id)
      const promocodes = await scope.findClaimedPromocodes()

      return NextResponse.json(promocodes.unwrap(), { status: 200 })
    },
  ),
)
