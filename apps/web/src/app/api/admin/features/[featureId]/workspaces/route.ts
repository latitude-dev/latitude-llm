import { adminHandler } from '$/middlewares/adminHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { getEnabledWorkspaceIdsForFeature } from '@latitude-data/core/services/workspaceFeatures/getEnabledWorkspaceIds'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(
    async (_: NextRequest, { params }: { params: { featureId: string } }) => {
      const featureId = parseInt(params.featureId)

      if (isNaN(featureId)) {
        return NextResponse.json(
          { message: 'Invalid feature ID' },
          { status: 400 },
        )
      }

      const result = await getEnabledWorkspaceIdsForFeature(featureId)
      const workspaceIds = result.unwrap()

      return NextResponse.json(workspaceIds, { status: 200 })
    },
  ),
)
