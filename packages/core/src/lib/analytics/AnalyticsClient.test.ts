import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EvaluationResultV2, EvaluationV2 } from '../../constants'
import { type Commit } from '../../schema/models/types/Commit'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { AnalyticsClient } from './AnalyticsClient'

type AnalyticsClientArgs = ConstructorParameters<typeof AnalyticsClient>[0]

const captureMock = vi.hoisted(() => vi.fn())
class TestProvider {
  capture = captureMock
}

describe('AnalyticsClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('does not send event without user email', async () => {
    const client = new AnalyticsClient({
      env: {
        nodeEnv: 'production',
        appDomain: 'latitude.so',
        optOutAnalytics: false,
        isCloud: true,
      },
      provider: new TestProvider(),
      event: {
        type: 'evaluationV2Ran',
        data: {
          workspaceId: 123,
          evaluation: {} as EvaluationV2,
          commit: {} as Commit,
          result: {} as EvaluationResultV2,
          spanId: 'span-id',
          traceId: 'trace-id',
        },
      },
    })
    await client.capture()

    expect(captureMock).not.toHaveBeenCalled()
  })

  describe('with user', () => {
    let user: User
    let workspace: Workspace

    beforeAll(async () => {
      const { workspace: wsp, userData: usr } = await factories.createWorkspace(
        { creator: { email: 'user@example.com' } },
      )
      user = usr
      workspace = wsp
    })

    it('does not send workspace without workspaceId', async () => {
      const client = new AnalyticsClient({
        env: {
          nodeEnv: 'production',
          appDomain: 'latitude.so',
          optOutAnalytics: false,
          isCloud: true,
        },
        provider: new TestProvider(),
        event: {
          type: 'membershipCreated',
          data: {
            id: 1,
            workspaceId: 123,
            userId: '234',
            invitationToken: 'a-token',
            confirmedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            authorId: '123',
            userEmail: 'owner@example.com',
          },
        },
      })

      await client.capture()

      expect(captureMock).not.toHaveBeenCalled()
    })

    it('does not send workspace without existing workspace', async () => {
      const client = new AnalyticsClient({
        env: {
          nodeEnv: 'production',
          appDomain: 'latitude.so',
          optOutAnalytics: false,
          isCloud: true,
        },
        provider: new TestProvider(),
        event: {
          type: 'workspaceCreated',
          data: {
            source: 'default',
            workspace: {} as Workspace, // Not really
            user,
            workspaceId: 123,
            userEmail: user.email,
          },
        },
      })

      await client.capture()

      expect(captureMock).not.toHaveBeenCalled()
    })

    it('sends workspace with existing workspace', async () => {
      const client = new AnalyticsClient({
        env: {
          nodeEnv: 'production',
          appDomain: 'latitude.so',
          optOutAnalytics: false,
          isCloud: true,
        },
        provider: new TestProvider(),
        event: {
          type: 'workspaceCreated',
          data: {
            source: 'default',
            workspace,
            user,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        },
      })

      await client.capture()

      expect(captureMock).toHaveBeenCalledWith({
        disableGeoip: true,
        distinctId: user.email,
        event: 'workspaceCreated',
        properties: {
          productEdition: 'cloud',
          appDomain: 'latitude.so',
          workspaceId: workspace.id,
          workspaceUuid: workspace.uuid,
          data: {
            source: 'default',
            workspace,
            user,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        },
      })
    })

    it('ignore opt-out analytics in cloud', async () => {
      const client = new AnalyticsClient({
        env: {
          nodeEnv: 'production',
          appDomain: 'latitude.so',
          optOutAnalytics: true,
          isCloud: true,
        },
        provider: new TestProvider(),
        event: {
          type: 'workspaceCreated',
          data: {
            source: 'default',
            workspace,
            user,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        },
      })

      await client.capture()

      expect(captureMock).toHaveBeenCalled()
    })

    it('does not send event when nodeEnv is development', async () => {
      const client = new AnalyticsClient({
        env: {
          nodeEnv: 'development',
          appDomain: 'latitude.so',
          optOutAnalytics: false,
          isCloud: true,
        },
        provider: new TestProvider(),
        event: {
          type: 'workspaceCreated',
          data: {
            source: 'default',
            workspace,
            user,
            workspaceId: workspace.id,
            userEmail: user.email,
          },
        },
      })

      await client.capture()

      expect(captureMock).not.toHaveBeenCalled()
    })

    describe('Open Source edition', () => {
      let args: AnalyticsClientArgs
      beforeEach(() => {
        args = {
          env: {
            nodeEnv: 'production',
            appDomain: 'latitude.org',
            optOutAnalytics: false,
            isCloud: false,
          },
          provider: new TestProvider(),
          event: {
            type: 'workspaceCreated',
            data: {
              source: 'default',
              workspace,
              user,
              workspaceId: workspace.id,
              userEmail: user.email,
            },
          },
        }
      })

      it('sends event', async () => {
        const client = new AnalyticsClient(args)
        await client.capture()

        expect(captureMock).toHaveBeenCalledWith({
          disableGeoip: true,
          distinctId: `user_${user.id}@workspace_${workspace.uuid}`,
          event: 'workspaceCreated',
          properties: {
            productEdition: 'oss',
            appDomain: 'latitude.org',
            workspaceId: workspace.id,
            workspaceUuid: workspace.uuid,
            data: {
              source: '[REDACTED]',
              workspace: '[REDACTED]',
              user: '[REDACTED]',
              workspaceId: '[REDACTED]',
              userEmail: '[REDACTED]',
            },
          },
        })
      })

      it('sends event when env is development', async () => {
        const client = new AnalyticsClient({
          ...args,
          env: { ...args.env, nodeEnv: 'development' },
        })
        await client.capture()

        expect(captureMock).toHaveBeenCalledWith({
          disableGeoip: true,
          distinctId: `user_${user.id}@workspace_${workspace.uuid}`,
          event: 'workspaceCreated',
          properties: {
            productEdition: 'oss',
            appDomain: 'latitude.org',
            workspaceId: workspace.id,
            workspaceUuid: workspace.uuid,
            data: {
              source: '[REDACTED]',
              workspace: '[REDACTED]',
              user: '[REDACTED]',
              workspaceId: '[REDACTED]',
              userEmail: '[REDACTED]',
            },
          },
        })
      })

      it('does not send the event when opt-out analytics is true', async () => {
        const client = new AnalyticsClient({
          ...args,
          env: { ...args.env, optOutAnalytics: true },
        })
        await client.capture()

        expect(captureMock).not.toHaveBeenCalled()
      })
    })
  })
})
