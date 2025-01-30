import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it } from 'vitest'

import { ProviderApiKey, Providers, Workspace } from '../../../browser'
import { cache } from '../../../cache'
import { Result } from '../../../lib'
import * as factories from '../../../tests/factories'
import { buildFreeRunCacheKey, getFreeRuns } from '../../freeRunsManager'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { checkFreeProviderQuota } from './index'

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
    })
    expect(result).toEqual(Result.ok(true))
  })

  describe('when using default provider', () => {
    it('return ok if free runs are within limit', async () => {
      const result = await checkFreeProviderQuota({
        workspace,
        provider,
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
        defaultProviderApiKey: provider.token,
      })

      expect(result).toEqual(
        Result.error(
          new ChainError({
            code: RunErrorCodes.DefaultProviderExceededQuota,
            message:
              'You have exceeded your maximum number of free runs for today',
          }),
        ),
      )
      resetFreeRuns(workspace.id, prevCount)
    })

    it('returns an error when the model is 4o', async () => {
      const model = 'gpt-4o'
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
              'The default provider does not support the gpt-4o model, except 4o-mini.',
          }),
        ),
      )
    })
  })
})
