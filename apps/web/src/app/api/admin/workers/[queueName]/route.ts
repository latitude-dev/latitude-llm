import { getQueueDetail } from '@latitude-data/core/services/workers/inspect'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  adminHandler(
    async (
      _: NextRequest,
      { params }: { params: { queueName: string } },
    ) => {
      const result = await getQueueDetail({ queueName: params.queueName })
      const detail = result.unwrap()
      return NextResponse.json(detail, { status: 200 })
    },
  ),
)
