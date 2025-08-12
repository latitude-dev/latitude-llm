import { NextRequest, NextResponse } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { findAllRewardClaimsPendingToValidate } from '@latitude-data/core/data-access'

export const POST = errorHandler(
  adminHandler(async (_req: NextRequest) => {
    const pendingRewards = await findAllRewardClaimsPendingToValidate().then(
      (r) => r.unwrap(),
    )
    return NextResponse.json({ pendingRewards }, { status: 200 })
  }),
)
