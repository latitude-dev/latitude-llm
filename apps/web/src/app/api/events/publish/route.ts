import { publisher } from '@latitude-data/core/events/publisher'
import { env } from '@latitude-data/env'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const POST = errorHandler(async (req: NextRequest) => {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.split(' ')[1]
  if (token !== env.EVENT_PUBLISHER_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const event = await req.json()
    if (!event) {
      return NextResponse.json({ error: 'Invalid event data' }, { status: 400 })
    }

    if (env.WORKERS) {
      return NextResponse.json(
        { error: 'Workers do not support Redis' },
        { status: 400 },
      )
    }

    await publisher.publishLater(event)

    return NextResponse.json(
      { message: 'Event published successfully' },
      { status: 200 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
})
