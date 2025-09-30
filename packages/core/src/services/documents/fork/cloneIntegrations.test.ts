import { describe, it, expect, beforeEach, vi } from 'vitest'

import { IntegrationType } from '@latitude-data/constants'
import { IntegrationDto, User, Workspace } from '../../../browser'
import * as factories from '../../../tests/factories'
import { cloneIntegrations } from './cloneIntegrations'
import { IntegrationsRepository } from '../../../repositories'
import { Result } from '../../../lib/Result'

vi.mock('../../../services/integrations/pipedream/apps', () => {
  return {
    getApp: vi.fn(async () =>
      Result.ok({ tools: [{ id: 't1' }], triggers: [{ id: 's1' }] }),
    ),
  }
})

vi.mock('../../../services/mcpServers/deployService', () => {
  return {
    deployMcpServer: vi.fn(async () =>
      Result.ok({ id: 1, endpoint: 'https://mock.mcp' }),
    ),
  }
})

describe('cloneIntegrations', () => {
  let originWorkspace: Workspace
  let targetWorkspace: Workspace
  let targetUser: User
  let targetIntegrationsRepo: IntegrationsRepository

  beforeEach(async () => {
    const { workspace: originWsp } = await factories.createWorkspace()
    originWorkspace = originWsp

    const { workspace: targetWsp, userData } = await factories.createWorkspace()
    targetWorkspace = targetWsp
    targetUser = userData

    targetIntegrationsRepo = new IntegrationsRepository(targetWorkspace.id)
  })

  it('creates new integrations when target workspace has none', async () => {
    const originIntegrations: IntegrationDto[] = []

    // External MCP only to avoid external API dependencies
    const external = await factories.createIntegration({
      workspace: originWorkspace,
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://external.example/sse' },
    })
    originIntegrations.push(external)

    const result = await cloneIntegrations({
      originIntegrations,
      targetWorkspace,
      targetUser,
    })

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('cloneIntegrations error:', result.error)
    }
    expect(result.ok).toBe(true)
    const mapping = result.unwrap()
    expect(Object.keys(mapping.id)).toHaveLength(originIntegrations.length)
    expect(Object.keys(mapping.name)).toHaveLength(originIntegrations.length)

    // All mapped integrations exist in target
    const targetAll = await targetIntegrationsRepo
      .findAll()
      .then((r) => r.unwrap())
    for (const origin of originIntegrations) {
      const mapped = mapping.name[origin.name]
      expect(mapped).toBeTruthy()
      expect(targetAll.some((i) => i.id === mapped.id)).toBe(true)
      // Names: pipedream uses appName, hosted uses type, others use same name by generator
    }
  })

  it('returns perfect match when same name and type exists', async () => {
    const origin = await factories.createIntegration({
      workspace: originWorkspace,
      name: 'my-ext',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://one' },
    })

    const targetSame = await factories.createIntegration({
      workspace: targetWorkspace,
      name: 'my-ext',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://two' },
    })

    const result = await cloneIntegrations({
      originIntegrations: [origin],
      targetWorkspace,
      targetUser,
    })

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('cloneIntegrations error:', result.error)
    }
    expect(result.ok).toBe(true)
    const mapping = result.unwrap()
    expect(mapping.name['my-ext'].id).toBe(targetSame.id)
  })

  it('matches by type (and appName for pipedream) when name differs', async () => {
    // External MCP: same type, different name
    const originExternal = await factories.createIntegration({
      workspace: originWorkspace,
      name: 'origin-ext',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://origin' },
    })

    const targetExternal = await factories.createIntegration({
      workspace: targetWorkspace,
      name: 'target-ext',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://target' },
    })

    // Pipedream: match by appName
    const originPipe = await factories.createIntegration({
      workspace: originWorkspace,
      name: 'origin-gh',
      type: IntegrationType.Pipedream,
      configuration: { appName: 'github', metadata: { displayName: 'GitHub' } },
    })

    const targetPipe = await factories.createIntegration({
      workspace: targetWorkspace,
      name: 'target-gh',
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'github',
        metadata: { displayName: 'GitHub' },
        connectionId: 'c1',
        externalUserId: 'u',
        authType: 'oauth',
      },
    })

    const result = await cloneIntegrations({
      originIntegrations: [originExternal, originPipe],
      targetWorkspace,
      targetUser,
    })

    expect(result.ok).toBe(true)
    const mapping = result.unwrap()
    expect(mapping.name['origin-ext'].id).toBe(targetExternal.id)
    expect(mapping.name['origin-gh'].id).toBe(targetPipe.id)
  })

  it('creates new when same name but different type exists', async () => {
    // Existing target has same name but different type
    await factories.createIntegration({
      workspace: targetWorkspace,
      name: 'shared',
      type: IntegrationType.Pipedream,
      configuration: { appName: 'github', metadata: { displayName: 'GitHub' } },
    })

    const origin = await factories.createIntegration({
      workspace: originWorkspace,
      name: 'shared',
      type: IntegrationType.ExternalMCP,
      configuration: { url: 'https://origin' },
    })

    const result = await cloneIntegrations({
      originIntegrations: [origin],
      targetWorkspace,
      targetUser,
    })

    expect(result.ok).toBe(true)
    const mapping = result.unwrap()
    const mapped = mapping.name['shared']
    expect(mapped.type).toBe(IntegrationType.ExternalMCP)
    expect(mapped.name).toBe('shared_1')

    const targetAll = await targetIntegrationsRepo
      .findAll()
      .then((r) => r.unwrap())
    const names = targetAll.map((i) => i.name)
    expect(names).toContain('shared')
    expect(names).toContain('shared_1')
  })
})
