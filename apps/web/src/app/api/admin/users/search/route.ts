import { NextRequest, NextResponse } from 'next/server'
import { searchUsersByEmails } from '@latitude-data/core/services/users/backoffice/searchUsers'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'

export const POST = errorHandler(
  adminHandler(async (req: NextRequest) => {
    const body = await req.json()
    const { emails } = body

    if (!emails || !Array.isArray(emails)) {
      return NextResponse.json(
        { error: 'Invalid request. Expected an array of emails.' },
        { status: 400 },
      )
    }

    // Filter out empty strings and trim whitespace
    const validEmails = emails
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0)

    const result = await searchUsersByEmails(validEmails)
    const users = result.unwrap()

    return NextResponse.json({ users }, { status: 200 })
  }),
)
