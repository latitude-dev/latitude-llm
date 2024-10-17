import { findAllEvaluationTemplates } from '@latitude-data/core/data-access'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { NextRequest, NextResponse } from 'next/server'

export const GET = errorHandler(
  authHandler(async (_: NextRequest) => {
    const result = await findAllEvaluationTemplates()
    const rows = result.unwrap()

    return NextResponse.json(rows, { status: 200 })
  }),
)
