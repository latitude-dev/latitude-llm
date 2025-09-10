import { NextRequest, NextResponse } from 'next/server'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { findAllPromocodes } from '@latitude-data/core/data-access/promocodes'

export const GET = errorHandler(
  adminHandler(async (_: NextRequest) => {
    const result = await findAllPromocodes()
    return NextResponse.json(result.unwrap(), { status: 200 })
  }),
)
