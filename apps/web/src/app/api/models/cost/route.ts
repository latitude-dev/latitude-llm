import { authHandler } from '$/middlewares/authHandler'
import { errorHandler } from '$/middlewares/errorHandler'
import { Providers } from '@latitude-data/constants'
import {
  getCostPer1M,
  ModelCostPer1M,
} from '@latitude-data/core/services/ai/index'
import { NextRequest, NextResponse } from 'next/server'

export type ModelCostResponse = Record<string, ModelCostPer1M>

export const GET = errorHandler(
  authHandler(async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams
    const queryModels = searchParams.getAll('model')

    const models = queryModels.map((modelId) => {
      const [provider, ...modelArr] = modelId.split('/')
      return { provider: provider as Providers, model: modelArr.join('/') }
    })

    const result: ModelCostResponse = {}
    for (const model of models) {
      const key = `${model.provider}/${model.model}`
      result[key] = getCostPer1M(model)
    }

    return NextResponse.json(result)
  }),
)
