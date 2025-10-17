import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'
import { User } from '@latitude-data/core/schema/models/types/User'

export const GET = errorHandler(
  authHandler(async (_: NextRequest, { user }: { user: User }) => {
    return NextResponse.json(user, { status: 200 })
  }),
)
