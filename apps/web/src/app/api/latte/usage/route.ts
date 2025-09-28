import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { usageLatteCredits } from '@latitude-data/core/services/copilot/latte/credits/usage'
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
      const usage = await usageLatteCredits({
        workspace: workspace,
      }).then((r) => r.unwrap())

      return NextResponse.json(usage, { status: 200 })
    },
  ),
)
