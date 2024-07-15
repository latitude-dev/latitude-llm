import { NextRequest, NextResponse } from 'next/server'

export default function apiHandler(
  handler: (req: NextRequest, params?: any) => Promise<NextResponse<any>>,
) {
  return async (req: NextRequest) => {
    try {
      handler(req)
    } catch (error: any) {
      console.error(error)

      return NextResponse.json(
        { error: error.message || 'Internal Server Error' },
        { status: error.statusCode || 500 },
      )
    }
  }
}
