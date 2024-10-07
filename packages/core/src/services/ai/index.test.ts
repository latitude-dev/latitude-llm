import { Message, MessageRole } from '@latitude-data/compiler'
import { describe, expect, it } from 'vitest'

import { ProviderApiKey, Providers, Workspace } from '../../browser'
import { LatitudeError } from '../../lib'
import { ai } from './index' // Import the function to be tested

describe('ai function', () => {
  it('should throw an error if Google provider is used without a user message', async () => {
    // @ts-expect-error
    const workspace: Workspace = {
      id: 1,
      name: 'Test Workspace',
      // Add other necessary properties for Workspace
    }

    // @ts-expect-error
    const provider: ProviderApiKey = {
      provider: Providers.Google,
      token: 'google-api-key',
      url: 'https://api.google.com',
    }

    const config = {
      model: 'test-model',
      // Add other necessary properties for config
    }

    const messages: Message[] = [
      // No user message included
      { role: MessageRole.system, content: 'System message' },
    ]

    await expect(
      ai({ workspace, provider, config, messages }),
    ).rejects.toThrowError(
      new LatitudeError('Google provider requires at least one user message'),
    )
  })
})
