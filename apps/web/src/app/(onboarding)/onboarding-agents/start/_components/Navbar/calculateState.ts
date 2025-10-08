import {
  ONBOARDING_STEPS,
  OnboardingStepKey,
} from '@latitude-data/constants/onboardingSteps'
import { StatusFlagState } from '@latitude-data/web-ui/molecules/StatusFlag'

export function calculateState(
  key: OnboardingStepKey,
  currentStep?: OnboardingStepKey | null, // TODO(onboarding): remove null when data migration is done
): StatusFlagState {
  if (!currentStep) {
    return StatusFlagState.pending
  }
  if (currentStep === key) {
    return StatusFlagState.inProgress
  }
  const currentOrder = ONBOARDING_STEPS[currentStep].order
  const keyOrder = ONBOARDING_STEPS[key].order
  if (currentOrder < keyOrder) {
    return StatusFlagState.pending
  }
  return StatusFlagState.completed
}
