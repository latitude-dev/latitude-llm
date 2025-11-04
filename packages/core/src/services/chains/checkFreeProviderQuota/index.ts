import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { env } from '@latitude-data/env'

import { DEFAULT_PROVIDER_MAX_FREE_RUNS } from '../../../constants'
import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Result } from '../../../lib/Result'
import { incrFreeRuns } from '../../freeRunsManager'
import { DEFAULT_PROVIDER_SUPPORTED_MODELS } from '../../ai/providers/models'

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
      message:
        'You have reached the limit of free runs. Add your own provider (OpenAI, Anthropic, etc) in Settings → Providers.',
    }),
  )
}
