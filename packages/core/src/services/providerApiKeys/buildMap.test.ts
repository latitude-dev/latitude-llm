import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Providers } from '@latitude-data/constants'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createProject } from '../../tests/factories'
import { createProviderApiKey } from '../../tests/factories/providerApiKeys'
import { buildProvidersMap } from './buildMap'

const mocks = await vi.hoisted(async () => ({
  getOrSet: vi.spyOn(await import('../../cache'), 'getOrSet'),
}))

describe('buildProvidersMap', () => {
  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    const { workspace: w, user: u } = await createProject({ providers: [] })
    workspace = w
    user = u

    mocks.getOrSet.mockClear()
  })

  it('builds a map from provider API keys', async () => {
    await createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'OpenAI Key',
      user,
    })

    await createProviderApiKey({
      workspace,
      type: Providers.Anthropic,
      name: 'Anthropic Key',
      user,
    })

    const result = await buildProvidersMap({ workspaceId: workspace.id })

    expect(result).toBeInstanceOf(Map)
    expect(result.has('OpenAI Key')).toBe(true)
    expect(result.has('Anthropic Key')).toBe(true)
    expect(result.get('OpenAI Key')).toMatchObject({
      name: 'OpenAI Key',
      provider: Providers.OpenAI,
    })
    expect(result.get('Anthropic Key')).toMatchObject({
      name: 'Anthropic Key',
      provider: Providers.Anthropic,
    })

    expect(mocks.getOrSet).toHaveBeenCalledOnce()
    expect(mocks.getOrSet).toHaveBeenCalledWith(
      `workspace:${workspace.id}:provider-api-keys-map`,
      expect.any(Function),
      3600,
    )
  })

  it('returns an empty map when no providers exist', async () => {
    const result = await buildProvidersMap({ workspaceId: workspace.id })

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)

    expect(mocks.getOrSet).toHaveBeenCalledOnce()
    expect(mocks.getOrSet).toHaveBeenCalledWith(
      `workspace:${workspace.id}:provider-api-keys-map`,
      expect.any(Function),
      3600,
    )
  })

  it('returns consistent results across multiple calls', async () => {
    await createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'OpenAI Key',
      user,
    })

    // First call
    const result1 = await buildProvidersMap({ workspaceId: workspace.id })
    expect(result1.has('OpenAI Key')).toBe(true)

    // Second call - should return the same result
    const result2 = await buildProvidersMap({ workspaceId: workspace.id })
    expect(result2.has('OpenAI Key')).toBe(true)
    expect(result1.size).toBe(result2.size)
  })

  it('handles providers with special characters in names', async () => {
    await createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'My Special Key!@#$%',
      user,
    })

    const result = await buildProvidersMap({ workspaceId: workspace.id })

    expect(result.size).toBe(1)
    expect(result.get('My Special Key!@#$%')).toMatchObject({
      name: 'My Special Key!@#$%',
      provider: Providers.OpenAI,
    })
  })

  it('only includes non-deleted providers', async () => {
    await createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'Active Key',
      user,
    })

    await createProviderApiKey({
      workspace,
      type: Providers.Anthropic,
      name: 'Deleted Key',
      user,
      deletedAt: new Date(),
    })

    const result = await buildProvidersMap({ workspaceId: workspace.id })

    expect(result.size).toBe(1)
    expect(result.has('Active Key')).toBe(true)
    expect(result.has('Deleted Key')).toBe(false)
  })
})
