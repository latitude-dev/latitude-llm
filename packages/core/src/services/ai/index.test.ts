import { Message, MessageRole } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { ProviderApiKey, Providers, RunErrorCodes } from '../../browser'
import { ChainError } from '../chains/ChainErrors'
import { ai } from './index'

describe('ai function', () => {
  it('should throw an error if Google provider is used without a user message', async () => {
    // @ts-expect-error
    const provider: ProviderApiKey = {
      provider: Providers.Google,
      token: 'google-api-key',
      url: 'https://api.google.com',
    }

    const config = {
      model: 'test-model',
    }

    const messages: Message[] = [
      { role: MessageRole.system, content: 'System message' },
    ]

    await expect(
      ai({ provider, config, messages }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.AIProviderConfigError,
        message: 'Google provider requires at least one user message',
      }),
    )
  })
})
