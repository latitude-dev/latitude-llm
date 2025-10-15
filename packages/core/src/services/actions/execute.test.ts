import * as env from '@latitude-data/env'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { ActionType } from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { getWorkspaceOnboarding } from '../workspaceOnboarding/get'
import * as onboardingServices from '../workspaceOnboarding/update'
import { executeAction } from './execute'

describe('executeAction', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let user: User

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const { workspace: w, userData: u } = await factories.createWorkspace({
      onboarding: true,
      features: ['latte'],
    })
    workspace = w
    user = u

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }

    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      // Note: unset this env to not call the copilot
      LATITUDE_CLOUD: false,
    })
  })

  it('fails when action type is not valid', async () => {
    await expect(
      executeAction({
        type: 'invalid' as any,
        parameters: { prompt: 'Create a dancing agent!' },
        user: user,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Invalid action type'))

    const onboarding = await getWorkspaceOnboarding({ workspace })
    expect(onboarding.value?.completedAt).toBeFalsy()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when action parameters are not valid', async () => {
    await expect(
      executeAction({
        type: ActionType.CreateAgent,
        parameters: {} as any,
        user: user,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError('Invalid action parameters'))

    const onboarding = await getWorkspaceOnboarding({ workspace })
    expect(onboarding.value?.completedAt).toBeFalsy()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when type execute fails', async () => {
    await expect(
      executeAction({
        type: ActionType.CreateAgent,
        parameters: { prompt: '' },
        user: user,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Prompt must be between 1 and 2500 characters'),
    )

    const onboarding = await getWorkspaceOnboarding({ workspace })
    expect(onboarding.value?.completedAt).toBeFalsy()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when onboarding was already completed', async () => {
    await onboardingServices.markWorkspaceOnboardingComplete({
      onboarding: await getWorkspaceOnboarding({ workspace }).then((r) =>r.unwrap()), // prettier-ignore
    })

    const result = await executeAction({
      type: ActionType.CreateAgent,
      parameters: { prompt: 'Create a dancing agent!' },
      user: user,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      prompt: expect.stringContaining('Create a dancing agent!'),
      projectId: expect.any(Number),
      commitUuid: expect.any(String),
    })
    const onboarding = await getWorkspaceOnboarding({ workspace })
    expect(onboarding.value?.completedAt).toBeTruthy()
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'actionExecuted',
      data: {
        workspaceId: workspace.id,
        userEmail: user.email,
        actionType: ActionType.CreateAgent,
      },
    })
  })
})
