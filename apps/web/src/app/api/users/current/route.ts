import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import type { User } from '@latitude-data/core/browser'
import { type NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(async (_: NextRequest, { user }: { user: User }) => {
    return NextResponse.json(user, { status: 200 })
  }),
)
