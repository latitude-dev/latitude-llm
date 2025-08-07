import { findAllFeaturesWithWorkspaceCounts } from '@latitude-data/core/services/features/findAllWithWorkspaceCounts'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const result = await findAllFeaturesWithWorkspaceCounts()
    const features = result.unwrap()

    return NextResponse.json(features, { status: 200 })
  }),
)
