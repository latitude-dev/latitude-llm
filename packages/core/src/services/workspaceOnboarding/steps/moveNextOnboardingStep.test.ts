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
import { OnboardingCompleteError } from './onboardingCompleteError'

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

    const result = await moveNextOnboardingStep({
      onboarding: workspaceOnboarding,
      workspace,
      currentStep: OnboardingStepKey.SetupIntegrations,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.ConfigureTriggers)
  })

  it('moves from first step directly to third when no pending integration triggers exist', async () => {
    const result = await moveNextOnboardingStep({
      onboarding: workspaceOnboarding,
      workspace,
      currentStep: OnboardingStepKey.SetupIntegrations,
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

    const result = await moveNextOnboardingStep({
      onboarding: workspaceOnboarding,
      currentStep: OnboardingStepKey.ConfigureTriggers,
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

    const result = await moveNextOnboardingStep({
      onboarding: workspaceOnboarding,
      currentStep: OnboardingStepKey.TriggerAgent,
      workspace,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.RunAgent)
  })

  it('fails when already at the last step', async () => {
    // Set current step to last step
    await database
      .update(workspaceOnboardingTable)
      .set({ currentStep: OnboardingStepKey.RunAgent })
      .where(eq(workspaceOnboardingTable.id, workspaceOnboarding.id))

    const result = await moveNextOnboardingStep({
      onboarding: workspaceOnboarding,
      currentStep: OnboardingStepKey.RunAgent,
      workspace,
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(OnboardingCompleteError)
  })
})
