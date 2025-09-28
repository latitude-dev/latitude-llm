import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { computeQuota } from '@latitude-data/core/services/grants/quota'
import { NextRequest, NextResponse } from 'next/server'
import { QuotaType } from '@latitude-data/core/constants'
import { Workspace, WorkspaceLimits } from '@latitude-data/core/schema/types'

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
      const seats = await computeQuota({
        type: QuotaType.Seats,
        workspace: workspace,
      }).then((r) => r.unwrap())

      const runs = await computeQuota({
        type: QuotaType.Runs,
        workspace: workspace,
      }).then((r) => r.unwrap())

      const credits = await computeQuota({
        type: QuotaType.Credits,
        workspace: workspace,
      }).then((r) => r.unwrap())

      const limits = {
        seats: seats.limit,
        runs: runs.limit,
        credits: credits.limit,
        resetsAt: credits.resetsAt,
      } as WorkspaceLimits

      return NextResponse.json(limits, { status: 200 })
    },
  ),
)
