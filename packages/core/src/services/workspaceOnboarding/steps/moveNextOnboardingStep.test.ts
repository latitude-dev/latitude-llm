import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { Workspace, WorkspaceOnboarding } from '../../../../src/schema/types'
import { database } from '../../../../src/client'
import { workspaceOnboarding as workspaceOnboardingTable } from '../../../../src/schema/models/workspaceOnboarding'
import * as factories from '../../../../src/tests/factories'
import { moveNextOnboardingStep } from './moveNextOnboardingStep'
import {
  DocumentTriggerStatus,
  IntegrationType,
} from '@latitude-data/constants'

describe('moveNextOnboardingStep', () => {
  let workspaceOnboarding: WorkspaceOnboarding
  let workspace: Workspace

  beforeEach(async () => {
    const { workspace: createdWorkspace } = await factories.createWorkspace({
      onboarding: true,
    })
    workspace = createdWorkspace

    // Get the created onboarding
    const onboardings = await database
      .select()
      .from(workspaceOnboardingTable)
      .where(eq(workspaceOnboardingTable.workspaceId, workspace.id))

    workspaceOnboarding = onboardings[0]!
  })

  it('moves from first step to second when pending integration triggers exist', async () => {
    // Create a project with a merged commit
    const { project, commit } = await factories.createProject({
      workspace,
      documents: {
        'test.promptl': 'test content',
      },
    })

    // Create a Pipedream integration
    const integration = await factories.createIntegration({
      workspace,
      type: IntegrationType.Pipedream,
      configuration: {
        appName: 'slack',
        authType: 'oauth',
      },
    })

    // Create a pending integration trigger
    await factories.createIntegrationDocumentTrigger({
      workspaceId: workspace.id,
      projectId: project.id,
      commitId: commit.id,
      integrationId: integration.id,
      triggerStatus: DocumentTriggerStatus.Pending,
    })

    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.SetupIntegrations,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
      workspace,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.ConfigureTriggers)
  })

  it('moves from first step directly to third when no pending integration triggers exist', async () => {
    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.SetupIntegrations,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
      workspace,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('moves always from second step to third', async () => {
    // Set current step to second step
    await database
      .update(workspaceOnboardingTable)
      .set({ currentStep: OnboardingStepKey.ConfigureTriggers })
      .where(eq(workspaceOnboardingTable.id, workspaceOnboarding.id))

    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.ConfigureTriggers,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
      workspace,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('moves always from third step to fourth', async () => {
    // Set current step to third step
    await database
      .update(workspaceOnboardingTable)
      .set({ currentStep: OnboardingStepKey.TriggerAgent })
      .where(eq(workspaceOnboardingTable.id, workspaceOnboarding.id))

    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.TriggerAgent,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
      workspace,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.RunAgent)
  })

  it('fails when current step is not set', async () => {
    const onboardingWithoutStep = {
      ...workspaceOnboarding,
      currentStep: null,
    }

    const result = await moveNextOnboardingStep({
      onboarding: onboardingWithoutStep,
      workspace,
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(
      new Error('Onboarding current step is not set'),
    )
  })

  it('fails when already at the last step', async () => {
    // Set current step to last step
    await database
      .update(workspaceOnboardingTable)
      .set({ currentStep: OnboardingStepKey.RunAgent })
      .where(eq(workspaceOnboardingTable.id, workspaceOnboarding.id))

    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.RunAgent,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
      workspace,
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(new Error('Onboarding is complete'))
  })
})
