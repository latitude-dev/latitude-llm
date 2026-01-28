import { NextRequest, NextResponse } from 'next/server'
import { computeWorkspaceUsage } from '@latitude-data/core/services/workspaces/usage'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access/workspaces'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'

export const GET = errorHandler(
  authHandler(
    async (
      request: NextRequest,
      {
        user,
      }: {
        user: { id: string; admin: boolean }
      },
    ) => {
      if (!user.admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      const { searchParams } = new URL(request.url)
      const workspaceId = searchParams.get('workspaceId')

      if (!workspaceId) {
        return NextResponse.json(
          { error: 'workspaceId is required' },
          { status: 400 },
        )
      }

      const workspace = await unsafelyFindWorkspace(Number(workspaceId))
      if (!workspace) {
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404 },
        )
      }

      const usageResult = await computeWorkspaceUsage(workspace)
      if (usageResult.error) {
        return NextResponse.json(
          { error: usageResult.error.message },
          { status: 500 },
        )
      }

      const usage = usageResult.value

      return NextResponse.json({
        runs: {
          used: usage.usage,
          limit: usage.max === Infinity ? 'unlimited' : usage.max,
        },
        seats: {
          used: usage.members,
          limit: usage.maxMembers === Infinity ? 'unlimited' : usage.maxMembers,
        },
      })
    },
  ),
)
