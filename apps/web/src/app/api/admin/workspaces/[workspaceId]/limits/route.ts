import { adminHandler } from '$/middlewares/adminHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { BadRequestError } from '@latitude-data/constants/errors'
import { QuotaType, WorkspaceLimits } from '@latitude-data/core/browser'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access'
import { computeQuota } from '@latitude-data/core/services/grants/quota'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(
    async (
      _: NextRequest,
      {
        params,
      }: {
        params: {
          workspaceId: number
        }
      },
    ) => {
      const { workspaceId } = params

      const workspace = await unsafelyFindWorkspace(workspaceId)
      if (!workspace) {
        throw new BadRequestError('Workspace not found')
      }

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
