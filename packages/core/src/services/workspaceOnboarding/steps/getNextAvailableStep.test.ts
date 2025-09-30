import { describe, expect, it } from 'vitest'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'
import { getNextAvailableStep } from './getNextAvailableStep'

describe('getNextAvailableStep', () => {
  it('succeeds when moving from first step to second', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.SetupIntegrations,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.ConfigureTriggers)
  })

  it('succeeds when moving from second step to third', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.ConfigureTriggers,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.TriggerAgent)
  })

  it('succeeds when moving from third step to fourth', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.TriggerAgent,
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toBe(OnboardingStepKey.RunAgent)
  })

  it('fails when already at the last step', async () => {
    const result = await getNextAvailableStep({
      currentStep: OnboardingStepKey.RunAgent,
    })

    expect(result.ok).toBe(false)
    expect(() => result.unwrap()).toThrow(new Error('Onboarding is complete'))
  })
})
