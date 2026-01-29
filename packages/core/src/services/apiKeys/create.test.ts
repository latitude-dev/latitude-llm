import { describe, expect, it } from 'vitest'

import { BadRequestError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import { createApiKey, MAX_API_KEY_NAME_LENGTH } from './create'

describe('createApiKey', () => {
  it('creates an api key without a name', async () => {
    const { workspace } = await factories.createWorkspace()

    const result = await createApiKey({ workspace })

    expect(result.ok).toBe(true)
    expect(result.value?.workspaceId).toBe(workspace.id)
    expect(result.value?.name).toBeNull()
  })

  it('creates an api key with a valid name', async () => {
    const { workspace } = await factories.createWorkspace()
    const name = 'My API Key'

    const result = await createApiKey({ name, workspace })

    expect(result.ok).toBe(true)
    expect(result.value?.name).toBe(name)
  })

  it('creates an api key with name at max length', async () => {
    const { workspace } = await factories.createWorkspace()
    const name = 'a'.repeat(MAX_API_KEY_NAME_LENGTH)

    const result = await createApiKey({ name, workspace })

    expect(result.ok).toBe(true)
    expect(result.value?.name).toBe(name)
  })

  it('returns an error when name exceeds max length', async () => {
    const { workspace } = await factories.createWorkspace()
    const name = 'a'.repeat(MAX_API_KEY_NAME_LENGTH + 1)

    const result = await createApiKey({ name, workspace })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe(
      `API key name must be ${MAX_API_KEY_NAME_LENGTH} characters or less`,
    )
  })
})
