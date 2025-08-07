import { IntegrationType } from '@latitude-data/constants'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntegrationDto } from '../../../../browser'
import { Result } from '../../../../lib/Result'
import { PipedreamIntegrationConfiguration } from '../../helpers/schema'
import * as appsModule from '../apps' // adjust the path if needed
import { configureComponent } from './configureComponent'

const configureComponentSpy = vi.fn().mockResolvedValue({})

vi.mock('@pipedream/sdk/server', () => ({
  createBackendClient: () => ({
    configureComponent: configureComponentSpy,
    getComponent: vi.fn().mockReturnValue(
      Promise.resolve({
        data: {
          name: 'New Branch Created',
          description: 'Emit new event when a branch is created.',
          component_type: 'source',
          version: '1.0.11',
          key: 'github-new-branch',
          configurable_props: [
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
      }),
    ),
  }),
}))

vi.spyOn(appsModule, 'getPipedreamEnvironment').mockReturnValue(
  Result.ok({
    environment: 'development',
    credentials: {
      clientId: 'test',
      clientSecret: 'test',
    },
    projectId: 'test',
  }),
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
    githubConfiguredProps = [
      {
        name: 'repoFullname',
        label: 'Repository',
        description:
          'The name of the repository (not case sensitive). The format should be `owner/repo` (for example, `PipedreamHQ/pipedream`).',
        type: 'string',
        remoteOptions: true,
        reloadProps: true,
      },
    ]
    configureComponentSpy.mockClear()
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
    expect(configureComponentSpy).toHaveBeenCalled()

    const call = configureComponentSpy.mock.calls[0]
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
  })
})
