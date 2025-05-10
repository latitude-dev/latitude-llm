import { NextResponse } from 'next/server'
import { env } from '@latitude-data/env'

export async function GET() {
  try {
    return NextResponse.json({
      inviteOnly: env.INVITE_ONLY,
    })
  } catch (error) {
    console.error('Error fetching app config:', error)
    return NextResponse.json(
      { error: 'Failed to load application configuration.' },
      { status: 500 },
    )
  }
}
