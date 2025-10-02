import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { WorkspaceOnboarding } from '../../../../src/schema/types'
import { database } from '../../../../src/client'
import { workspaceOnboarding as workspaceOnboardingTable } from '../../../../src/schema/models/workspaceOnboarding'
import * as factories from '../../../../src/tests/factories'
import { moveNextOnboardingStep } from './moveNextOnboardingStep'

describe('moveNextOnboardingStep', () => {
  let workspaceOnboarding: WorkspaceOnboarding

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const { workspace } = await factories.createWorkspace({
      onboarding: true,
    })

    // Get the created onboarding
    const onboardings = await database
      .select()
      .from(workspaceOnboardingTable)
      .where(eq(workspaceOnboardingTable.workspaceId, workspace.id))

    workspaceOnboarding = onboardings[0]!
  })

  it('succeeds when moving from first step to second', async () => {
    const updatedOnboarding = {
      ...workspaceOnboarding,
      currentStep: OnboardingStepKey.SetupIntegrations,
    }

    const result = await moveNextOnboardingStep({
      onboarding: updatedOnboarding,
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.ConfigureTriggers)
  })

  it('succeeds when moving from second step to third', async () => {
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
    })

    expect(result.ok).toBe(true)
    const updated = result.unwrap()
    expect(updated.currentStep).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('succeeds when moving from third step to fourth', async () => {
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
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(new Error('Onboarding is complete'))
  })
})
