import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { getLatteDebugVersions } from '@latitude-data/core/services/copilot/latte/debugVersions'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
import { adminHandler } from '$/middlewares/adminHandler'

export const GET = errorHandler(
  adminHandler(
    async (
      _: NextRequest,
      {
        workspace,
      }: {
        workspace: Workspace
      },
    ) => {
      const result = await getLatteDebugVersions(workspace.id)
      const latteVersions = result.error ? [] : result.unwrap()

      return NextResponse.json(latteVersions, { status: 200 })
    },
  ),
)
