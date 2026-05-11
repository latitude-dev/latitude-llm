import { getQueueJobs } from '@latitude-data/core/services/workers/inspect'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_STATES = [
  'active',
  'waiting',
  'delayed',
  'completed',
  'failed',
] as const

type QueueJobState = (typeof ALLOWED_STATES)[number]

function parseState(value: string | null): QueueJobState {
  if (value && (ALLOWED_STATES as readonly string[]).includes(value)) {
    return value as QueueJobState
  }
  return 'failed'
}

function parseNumber(value: string | null, fallback: number) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const GET = errorHandler(
  adminHandler(
    async (
      request: NextRequest,
      { params }: { params: { queueName: string } },
    ) => {
      const { searchParams } = request.nextUrl
      const state = parseState(searchParams.get('state'))
      const start = parseNumber(searchParams.get('start'), 0)
      const end = parseNumber(searchParams.get('end'), 100)

      const result = await getQueueJobs({
        queueName: params.queueName,
        state,
        start,
        end,
      })

      return NextResponse.json(result.unwrap(), { status: 200 })
    },
  ),
)
