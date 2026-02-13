import { NextRequest, NextResponse } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { MAINTENANCE_JOB_REGISTRY } from '@latitude-data/core/services/maintenance/registry'
import { getQueueJobs } from '@latitude-data/core/services/workers/inspect'
import { Queues } from '@latitude-data/core/queues/types'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const [activeResult, waitingResult] = await Promise.all([
      getQueueJobs({
        queueName: Queues.maintenanceQueue,
        state: 'active',
        start: 0,
        end: 100,
      }),
      getQueueJobs({
        queueName: Queues.maintenanceQueue,
        state: 'waiting',
        start: 0,
        end: 100,
      }),
    ])

    const activeJobs = activeResult.unwrap()
    const waitingJobs = waitingResult.unwrap()

    return NextResponse.json(
      {
        registry: MAINTENANCE_JOB_REGISTRY,
        activeJobs,
        waitingJobs,
      },
      { status: 200 },
    )
  }),
)
