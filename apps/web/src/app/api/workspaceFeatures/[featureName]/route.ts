import type { Workspace } from '@latitude-data/core/browser'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        workspace,
        params,
      }: {
        workspace: Workspace
        params: { featureName: string }
      },
    ) => {
      const isEnabled = await isFeatureEnabledByName(workspace.id, params.featureName).then((r) =>
        r.unwrap(),
      )

      return NextResponse.json({ enabled: isEnabled }, { status: 200 })
    },
  ),
)
