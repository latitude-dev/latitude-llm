import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { type NextRequest, NextResponse } from 'next/server'
import { getApp } from '@latitude-data/core/services/integrations/pipedream/apps'

export const GET = errorHandler(
  authHandler(
    async (
      _: NextRequest,
      {
        params,
      }: {
        params: {
          slugName: string
        }
      },
    ) => {
      const result = await getApp({ name: params.slugName })

      if (result.error) {
        return NextResponse.json(
          {
            ok: false,
            errorMessage: result.error.message,
          },
          { status: 200 },
        )
      }

      return NextResponse.json(
        {
          ok: true,
          data: result.unwrap(),
        },
        { status: 200 },
      )
    },
  ),
)
