import { NextRequest, NextResponse } from 'next/server'

type ApiMessageResponse = {
  message: string
}

type ApiErrorResponse = {
  error: string
}

export type RouteHandler<T> = (
  req: NextRequest,
  res: any,
) => Promise<
  | NextResponse<T>
  | NextResponse<ApiErrorResponse>
  | NextResponse<ApiMessageResponse>
>
