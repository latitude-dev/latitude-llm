import { beforeEach, describe, expect, it } from 'vitest'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { getNextAvailableStep } from './getNextAvailableStep'
import { Workspace } from '../../../schema/types'
import * as factories from '../../../../src/tests/factories'
import {
  DocumentTriggerStatus,
  IntegrationType,
} from '@latitude-data/constants'

describe('getNextAvailableStep', () => {
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace()
    workspace = createdWorkspace
  })

  it('moves from setup integrations to configure triggers when pending pipedream triggers exist', async () => {
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
    const integrationId = integration.id
    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      integrationId,
      triggerStatus: DocumentTriggerStatus.Pending,
    })

    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.SetupIntegrations,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.ConfigureTriggers)
  })

  it('moves from setup integrations directly to trigger agent when no pending integration triggers exist', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.SetupIntegrations,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('moves from setup integrations directly to trigger agent when non-pipedream triggers exist', async () => {
    const { project, commit } = await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })

    await factories.createScheduledDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
    })

    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.SetupIntegrations,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('moves always from configure triggers to trigger agent', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.ConfigureTriggers,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('moves always from trigger agent to run agent', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.TriggerAgent,
      workspace,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.RunAgent)
  })

  it('fails when already at the last step', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.RunAgent,
      workspace,
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(new Error('Onboarding is complete'))
  })
})
