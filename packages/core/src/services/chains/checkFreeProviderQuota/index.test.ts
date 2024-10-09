import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkFreeProviderQuota } from './index'
import {
  DEFAULT_PROVIDER_MAX_FREE_RUNS,
  ProviderApiKey,
  Providers,
  RunErrorCodes,
  Workspace,
} from '../../../browser'
import { Result } from '../../../lib'
import * as factories from '../../../tests/factories'
import { ChainError } from '../ChainErrors'

const mocks = vi.hoisted(() => {
  return {
    incFreeRunsMock: vi.fn(),
  }
})
vi.mock('../../freeRunsManager', () => ({
  incrFreeRuns: mocks.incFreeRunsMock,
}))

let workspace: Workspace
let provider: ProviderApiKey

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
    it.only('return ok if free runs are within limit', async () => {
      mocks.incFreeRunsMock.mockResolvedValue(3)
      const result = await checkFreeProviderQuota({
        workspace,
        provider,
        defaultProviderApiKey: provider.token,
      })
      expect(result).toEqual(Result.ok(true))
    })

    it('return an error if free runs exceed the limit', async () => {
      mocks.incFreeRunsMock.mockImplementation(async (_wpId: number) => {
        return DEFAULT_PROVIDER_MAX_FREE_RUNS + 1
      })

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
    })
  })
})
