import type { Workspace } from '@latitude-data/core/browser'
import { ClaimedRewardsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

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
      const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id)
      const result = await claimedRewardsScope.findAllValidOptimistic()
      const rows = result.unwrap()

      return NextResponse.json(rows, { status: 200 })
    },
  ),
)
