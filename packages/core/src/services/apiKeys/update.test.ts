import { describe, expect, it } from 'vitest'

import { BadRequestError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { MAX_API_KEY_NAME_LENGTH } from './create'
import { updateApiKey } from './update'

describe('updateApiKey', () => {
  it('updates an api key with a valid name', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })
    const newName = 'Updated API Key'

    const result = await updateApiKey(apiKey, { name: newName })

    expect(result.ok).toBe(true)
    expect(result.value?.name).toBe(newName)
  })

  it('updates an api key with name at max length', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })
    const newName = 'b'.repeat(MAX_API_KEY_NAME_LENGTH)

    const result = await updateApiKey(apiKey, { name: newName })

    expect(result.ok).toBe(true)
    expect(result.value?.name).toBe(newName)
  })

  it('returns an error when name exceeds max length', async () => {
    const { workspace } = await factories.createWorkspace()
    const { apiKey } = await factories.createApiKey({ workspace })
    const newName = 'b'.repeat(MAX_API_KEY_NAME_LENGTH + 1)

    const result = await updateApiKey(apiKey, { name: newName })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      `API key name must be ${MAX_API_KEY_NAME_LENGTH} characters or less`,
    )
  })
})
