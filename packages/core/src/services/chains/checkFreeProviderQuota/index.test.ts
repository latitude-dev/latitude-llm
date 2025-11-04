import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import { type ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Providers } from '@latitude-data/constants'
import { cache } from '../../../cache'
import * as factories from '../../../tests/factories'
import { buildFreeRunCacheKey, getFreeRuns } from '../../freeRunsManager'
import { checkFreeProviderQuota } from './index'
import { Result } from './../../../lib/Result'

let workspace: Workspace
let provider: ProviderApiKey

async function resetFreeRuns(
  workspaceId: number,
  prevCount: number | null | string,
) {
  const c = await cache()
  const key = buildFreeRunCacheKey(workspaceId)
  c.set(key, prevCount === null ? 0 : prevCount)
}

async function incrFreeRunsBy(workspaceId: number, amount: number) {
  const c = await cache()
  const key = buildFreeRunCacheKey(workspaceId)
  c.incrby(key, amount)
}

describe('checkFreeProviderQuota', () => {
  beforeEach(async () => {
    const { workspace: w, providers } = await factories.createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
    })
    workspace = w
    provider = providers[0]!
  })

  it('return ok if provider token is not default', async () => {
    const result = await checkFreeProviderQuota({
      workspace,
      provider,
      model: 'gpt-4o-mini',
    })
    expect(result).toEqual(Result.ok(true))
  })

  describe('when using default provider', () => {
    it('return ok if free runs are within limit', async () => {
      const result = await checkFreeProviderQuota({
        workspace,
        provider,
        model: 'gpt-4o-mini',
        defaultProviderApiKey: provider.token,
      })
      expect(result).toEqual(Result.ok(true))
    })

    it('return an error if free runs exceed the limit', async () => {
      const prevCount = (await getFreeRuns(workspace.id)) || 0
      await incrFreeRunsBy(workspace.id, 1000)
      const result = await checkFreeProviderQuota({
        workspace,
        provider,
        model: 'gpt-4o-mini',
        defaultProviderApiKey: provider.token,
      })

      expect(result).toEqual(
        Result.error(
          new ChainError({
            code: RunErrorCodes.DefaultProviderExceededQuota,
            message:
              'You have reached the limit of free runs. Add your own provider (OpenAI, Anthropic, etc) in Settings → Providers.',
          }),
        ),
      )
      resetFreeRuns(workspace.id, prevCount)
    })

    it('returns an error when the model is not permited for default provider', async () => {
      const model = 'o1-mini'
      const result = await checkFreeProviderQuota({
        workspace,
        provider,
        model,
        defaultProviderApiKey: provider.token,
      })

      expect(result.ok).toBe(false)
      expect(result).toEqual(
        Result.error(
          new ChainError({
            code: RunErrorCodes.DefaultProviderInvalidModel,
            message:
              "You're using o1-mini model. The default provider only supports these models: gpt-4o-mini, gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano. Please use a different provider or model",
          }),
        ),
      )
    })
  })
})
