import { BadRequestError } from '@latitude-data/core/lib/errors'
import { ProviderLogsRepository } from '@latitude-data/core/repositories'
import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import providerLogPresenter from '$/presenters/providerLogPresenter'
import { NextRequest, NextResponse } from 'next/server'

type IParam = { providerLogId: string }
type ReturnResponse = ReturnType<typeof providerLogPresenter>
export const GET = errorHandler<IParam, ReturnResponse>(
  authHandler<IParam, ReturnResponse>(
    async (_: NextRequest, { params, workspace }) => {
      const { providerLogId } = params

      if (!providerLogId) {
        throw new BadRequestError(`Provider log ID is required`)
      }

      const providerLogsScope = new ProviderLogsRepository(workspace.id)
      const providerLog = await providerLogsScope
        .find(Number(providerLogId))
        .then((r) => r.unwrap())

      return NextResponse.json(providerLogPresenter(providerLog), {
        status: 200,
      })
    },
  ),
)
