import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'

import {
  DEFAULT_PROVIDER_MAX_FREE_RUNS,
  DEFAULT_PROVIDER_SUPPORTED_MODELS,
  ProviderApiKey,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib/Result'
import { incrFreeRuns } from '../../freeRunsManager'

export async function checkFreeProviderQuota({
  workspace,
  provider,
  model,
  defaultProviderApiKey = env.DEFAULT_PROVIDER_API_KEY,
}: {
  workspace: Workspace
  provider: ProviderApiKey
  model: string
  defaultProviderApiKey?: string
}) {
  return Result.ok(true)
  if (provider.token !== defaultProviderApiKey) return Result.ok(true)
  if (!DEFAULT_PROVIDER_SUPPORTED_MODELS.includes(model ?? '')) {
    return Result.error(
      new ChainError({
        code: RunErrorCodes.DefaultProviderInvalidModel,
        message: `You're using ${model} model. The default provider only supports these models: ${DEFAULT_PROVIDER_SUPPORTED_MODELS.join(', ')}. Please use a different provider or model`,
      }),
    )
  }

  const value = await incrFreeRuns(workspace.id)
  if (!value || value <= DEFAULT_PROVIDER_MAX_FREE_RUNS) return Result.ok(true)

  return Result.error(
    new ChainError({
      code: RunErrorCodes.DefaultProviderExceededQuota,
      message: 'You have exceeded your maximum number of free runs for today',
    }),
  )
}
