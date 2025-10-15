import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
} from '@latitude-data/constants/onboardingSteps'
import {
  IntegrationType,
  DocumentTriggerStatus,
} from '@latitude-data/constants'
import { getFirstStep } from './getFirstStep'
import * as factories from '../../../../src/tests/factories'
import { type Workspace } from '../../../schema/models/types/Workspace'

describe('getFirstStep', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace
  })

  it('returns TriggerAgent when no integrations exist', async () => {
    const result = await getFirstStep({
      workspace,
    })

    expect(result.ok).toBe(true)
    const resultValue = result.unwrap()
    expect(resultValue).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('returns SetupIntegrations when pipedream integration exist', async () => {
    await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
        metadata: {
          displayName: 'Slack',
        },
      },
    })

    const result = await getFirstStep({
      workspace,
    })

    expect(result.ok).toBe(true)
    const resultValue = result.unwrap()
    expect(resultValue).toBe(OnboardingStepKey.SetupIntegrations)
  })

  it('returns SetupIntegrations when external MCP integration exist', async () => {
    await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })
    await factories.createIntegration({
      workspace,
      type: IntegrationType.ExternalMCP,
      configuration: {
        url: 'https://example.com',
      },
    })

    const result = await getFirstStep({
      workspace,
    })

    expect(result.ok).toBe(true)
    const resultValue = result.unwrap()
    expect(resultValue).toBe(OnboardingStepKey.SetupIntegrations)
  })

  it('returns ConfigureTriggers when it is the first step in order (testing getFirstStepByOrder works as expected)', async () => {
    // Create a pending integration trigger to make ConfigureTriggers necessary
    const { project, commit } = await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })

    const integration = await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
      },
    })

    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      integrationId: integration.id,
      triggerStatus: DocumentTriggerStatus.Pending,
    })

    // Mock the ONBOARDING_STEPS constant to make ConfigureTriggers the first step
    const mockOnboardingSteps = {
      [OnboardingStepKey.SetupIntegrations]: {
        order: 2,
      },
      [OnboardingStepKey.TriggerAgent]: {
        order: 3,
      },
      [OnboardingStepKey.RunAgent]: {
        order: 4,
      },
      [OnboardingStepKey.ConfigureTriggers]: {
        order: 1,
      },
    } as unknown as typeof ONBOARDING_STEPS

    // Use vi.spyOn to mock the imported constant
    const onboardingStepsSpy = vi.spyOn(
      await import('@latitude-data/constants/onboardingSteps'),
      'ONBOARDING_STEPS',
      'get',
    )
    onboardingStepsSpy.mockReturnValue(mockOnboardingSteps)

    const result = await getFirstStep({
      workspace,
    })

    expect(result.ok).toBe(true)
    const resultValue = result.unwrap()
    expect(resultValue).toBe(OnboardingStepKey.ConfigureTriggers)

    // Clean up the mock
    onboardingStepsSpy.mockRestore()
  })
})
