import { Workspace } from '@latitude-data/core/browser'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { getLatteDebugVersions } from '@latitude-data/core/services/copilot/latte/debugVersions'
// FIXME: Restore this
// import { adminHandler } from '$/middlewares/adminHandler'
import { authHandler } from '$/middlewares/authHandler'

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
      /* const result = await getLatteDebugVersions(workspace.id) */
      /* const latteVersions = result.unwrap() */

      return NextResponse.json([], { status: 200 })
    },
  ),
)
