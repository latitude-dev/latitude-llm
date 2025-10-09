import { toggleFeatureGlobally } from '@latitude-data/core/services/features/toggleGlobally'
import { errorHandler } from '$/middlewares/errorHandler'
import { adminHandler } from '$/middlewares/adminHandler'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const toggleSchema = z.object({
  enabled: z.boolean(),
})

export const POST = errorHandler(
  adminHandler(
    async (
      request: NextRequest,
      { params }: { params: { featureId: string } },
    ) => {
      const featureId = parseInt(params.featureId)

      if (isNaN(featureId)) {
        return NextResponse.json(
          { message: 'Invalid feature ID' },
          { status: 400 },
        )
      }

      const body = await request.json()
      const parsedBody = toggleSchema.parse(body)

      const result = await toggleFeatureGlobally(featureId, parsedBody.enabled)
      const feature = result.unwrap()

      return NextResponse.json(feature, { status: 200 })
    },
  ),
)
