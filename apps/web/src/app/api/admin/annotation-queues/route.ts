import { findAllAnnotationQueues } from '@latitude-data/core/queries/annotationQueues/find'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const queues = await findAllAnnotationQueues()
    return NextResponse.json(queues, { status: 200 })
  }),
)
