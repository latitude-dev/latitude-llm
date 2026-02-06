import { getAllQueueStats } from '@latitude-data/core/services/workers/inspect'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const result = await getAllQueueStats()
    const stats = result.unwrap()
    return NextResponse.json(stats, { status: 200 })
  }),
)
