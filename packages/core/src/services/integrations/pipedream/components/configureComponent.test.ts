import { beforeEach, describe, expect, vi, it } from 'vitest'
import { IntegrationDto } from '../../../../schema/types'
import { IntegrationType } from '@latitude-data/constants'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/server'
import * as appsModule from '../apps'
import { configureComponent } from './configureComponent'
import { Result } from '../../../../lib/Result'
import { PipedreamIntegrationConfiguration } from '../../helpers/schema'

const configurePropSpy = vi.fn().mockResolvedValue({})
const retrieveComponentSpy = vi.fn().mockResolvedValue({
  data: {
    name: 'New Branch Created',
    description: 'Emit new event when a branch is created.',
    componentType: 'source',
    version: '1.0.11',
    key: 'github-new-branch',
    configurableProps: [
      {
        name: 'github',
        type: 'app',
        app: 'github',
      },
      {
        name: 'repoFullname',
        label: 'Repository',
        description:
          'The name of the repository (not case sensitive). The format should be `owner/repo` (for example, `PipedreamHQ/pipedream`).',
        type: 'string',
        remoteOptions: true,
        reloadProps: true,
      },
      {
        name: 'db',
        type: '$.service.db',
      },
    ],
  },
})

const mockPipedreamClient = {
  components: {
    configureProp: configurePropSpy,
    retrieve: retrieveComponentSpy,
  },
}

vi.mock('@pipedream/sdk/server', () => ({
  PipedreamClient: vi.fn(() => mockPipedreamClient),
}))

vi.spyOn(appsModule, 'getPipedreamClient').mockReturnValue(
  Result.ok(mockPipedreamClient as never),
)

describe('Pipedream Configuring Components', () => {
  let githubIntegration: Extract<
    IntegrationDto,
    {
      type: IntegrationType.Pipedream
      configuration: PipedreamIntegrationConfiguration
    }
  >
  let githubComponentId: string
  let githubConfiguredProps: ConfiguredProps<ConfigurableProps>

  beforeEach(() => {
    githubIntegration = {
      id: -1,
      name: 'Github Integration',
      workspaceId: 1,
      authorId: 'manuel@latitude.so',
      lastUsedAt: new Date('2024-06-01T15:00:00Z'),
      createdAt: new Date('2024-06-01T12:00:00Z'),
      updatedAt: new Date('2024-06-01T12:00:00Z'),
      deletedAt: null,
      mcpServerId: null,
      hasTools: true,
      hasTriggers: true,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'github',
        connectionId: '12345',
        metadata: {
          displayName: 'github',
        },
        externalUserId: '67890',
        authType: 'oauth',
        oauthAppId: 'oauth-app-id',
      },
    }

    githubComponentId = 'github-new-branch'
    githubConfiguredProps = {
      repoFullname: 'PipedreamHQ/pipedream',
    }
    configurePropSpy.mockClear()
    retrieveComponentSpy.mockClear()
  })

  it('Should configure the component with the correct props', async () => {
    // Act
    const result = await configureComponent({
      integration: githubIntegration,
      componentId: githubComponentId,
      propName: 'repoFullname',
      configuredProps: githubConfiguredProps,
    })

    // Assert
    expect(result.ok).toBe(true)
    expect(configurePropSpy).toHaveBeenCalled()
    expect(retrieveComponentSpy).toHaveBeenCalledWith(githubComponentId)

    const call = configurePropSpy.mock.calls[0]
    expect(call).toBeDefined()
    const args = call?.[0]
    expect(args).toBeDefined()
    expect(args?.configuredProps).toBeDefined()

    // Should always have the app prop with the authProvisionId
    expect(args?.configuredProps).toHaveProperty(
      githubIntegration.configuration.appName,
    )
    expect(args?.configuredProps.github).toBeDefined()
    expect(args?.configuredProps.github).toEqual({
      authProvisionId: githubIntegration.configuration.connectionId,
    })

    // Verify correct parameters are passed to configureProp
    expect(args?.id).toBe(githubComponentId)
    expect(args?.externalUserId).toBe(
      githubIntegration.configuration.externalUserId,
    )
    expect(args?.propName).toBe('repoFullname')
  })
})
