'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { skipOnboardingAction } from '$/actions/workspaceOnboarding/skip'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import {
  useOnboardingState,
  ONBOARDING_STEPS,
} from '../_lib/useOnboardingState'
import { Step0_WhatIsLatitude } from './Step0_WhatIsLatitude'
import { Step1_ReliabilityLoop } from './Step1_ReliabilityLoop'
import { Step3_ConnectChoice } from './Step3_ConnectChoice'
import { Step4_Integration } from './Step4_Integration'
import { Step5_WaitingForTrace } from './Step5_WaitingForTrace'
import { Step6_FirstTrace } from './Step6_FirstTrace'
import { Step7_NextSteps } from './Step7_NextSteps'

type Props = {
  workspaceApiKey?: string
  projectId: number
  commitUuid: string
  documentUuid?: string
}

export function OnboardingFlow({ workspaceApiKey, projectId, commitUuid, documentUuid }: Props) {
  const posthog = usePostHog()
  const searchParams = useSearchParams()
  const router = useRouter()
  const shouldReset = searchParams.get('reset') === 'true'
  const {
    currentStep,
    currentSlide,
    currentSlideIndex,
    totalSlides,
    isFirstSlide,
    isLastSlide,
    firstTraceId,
    goToStep,
    nextSlide,
    prevSlide,
    setFirstTraceId,
  } = useOnboardingState(shouldReset)

  useEffect(() => {
    if (shouldReset) {
      router.replace('/onboarding', { scroll: false })
    }
  }, [shouldReset, router])

  const { setValue: setReplayOnboarding } = useLocalStorage<boolean>({
    key: AppLocalStorage.replayOnboarding,
    defaultValue: false,
  })

  const { execute: skipOnboarding, isPending: isSkipping } =
    useLatitudeAction(skipOnboardingAction)

  const { execute: completeOnboarding } =
    useLatitudeAction(completeOnboardingAction)

  const hasCompletedOnboardingRef = useRef(false)

  const trackStep = useCallback(
    (step: number, action: 'viewed' | 'completed') => {
      try {
        posthog?.capture(`onboarding_step_${action}`, { step })
      } catch (_) {
        // Ignore analytics errors
      }
    },
    [posthog],
  )

  useEffect(() => {
    trackStep(currentStep, 'viewed')
  }, [currentStep, trackStep])

  // Automatically mark onboarding as complete when user reaches the final step
  // This allows them to click links without being redirected back to onboarding
  useEffect(() => {
    if (currentStep === ONBOARDING_STEPS.NEXT_STEPS && !hasCompletedOnboardingRef.current) {
      hasCompletedOnboardingRef.current = true
      setReplayOnboarding(false)
      completeOnboarding()
    }
  }, [currentStep, setReplayOnboarding, completeOnboarding])

  const handleSkipOnboarding = useCallback(() => {
    try {
      posthog?.capture('onboarding_skipped', { step: currentStep })
    } catch (_) {
      // Ignore analytics errors
    }
    setReplayOnboarding(false)
    skipOnboarding()
  }, [posthog, currentStep, setReplayOnboarding, skipOnboarding])

  const handleCompleteOnboarding = useCallback(() => {
    try {
      posthog?.capture('onboarding_completed')
    } catch (_) {
      // Ignore analytics errors
    }
    setReplayOnboarding(false)
    skipOnboarding()
  }, [posthog, setReplayOnboarding, skipOnboarding])

  const handleTraceReceived = useCallback(
    (traceId: string) => {
      try {
        posthog?.capture('onboarding_first_trace_received')
      } catch (_) {
        // Ignore analytics errors
      }
      setFirstTraceId(traceId)
      goToStep(ONBOARDING_STEPS.FIRST_TRACE)
    },
    [posthog, setFirstTraceId, goToStep],
  )

  const handleStep0Continue = useCallback(() => {
    trackStep(ONBOARDING_STEPS.WHAT_IS_LATITUDE, 'completed')
    goToStep(ONBOARDING_STEPS.RELIABILITY_LOOP)
  }, [trackStep, goToStep])

  const handleStep3Integrate = useCallback(() => {
    trackStep(ONBOARDING_STEPS.CONNECT_CHOICE, 'completed')
    goToStep(ONBOARDING_STEPS.INTEGRATION)
  }, [trackStep, goToStep])

  const handleStep4Continue = useCallback(() => {
    trackStep(ONBOARDING_STEPS.INTEGRATION, 'completed')
    goToStep(ONBOARDING_STEPS.WAITING_FOR_TRACE)
  }, [trackStep, goToStep])

  const handleStep4Back = useCallback(() => {
    goToStep(ONBOARDING_STEPS.CONNECT_CHOICE)
  }, [goToStep])

  const handleStep5Back = useCallback(() => {
    goToStep(ONBOARDING_STEPS.INTEGRATION)
  }, [goToStep])

  const handleStep6Continue = useCallback(() => {
    trackStep(ONBOARDING_STEPS.FIRST_TRACE, 'completed')
    goToStep(ONBOARDING_STEPS.NEXT_STEPS)
  }, [trackStep, goToStep])

  switch (currentStep) {
    case ONBOARDING_STEPS.WHAT_IS_LATITUDE:
      return <Step0_WhatIsLatitude onContinue={handleStep0Continue} />

    case ONBOARDING_STEPS.RELIABILITY_LOOP:
      return (
        <Step1_ReliabilityLoop
          slide={currentSlide!}
          slideIndex={currentSlideIndex}
          totalSlides={totalSlides}
          isFirstSlide={isFirstSlide}
          isLastSlide={isLastSlide}
          onNext={nextSlide}
          onBack={prevSlide}
        />
      )

    case ONBOARDING_STEPS.CONNECT_CHOICE:
      return (
        <Step3_ConnectChoice
          onIntegrate={handleStep3Integrate}
          onSkip={handleSkipOnboarding}
          onBack={() => goToStep(ONBOARDING_STEPS.RELIABILITY_LOOP)}
          isSkipping={isSkipping}
        />
      )

    case ONBOARDING_STEPS.INTEGRATION:
      return (
        <Step4_Integration
          workspaceApiKey={workspaceApiKey}
          projectId={projectId}
          onContinue={handleStep4Continue}
          onBack={handleStep4Back}
          onFinish={handleSkipOnboarding}
        />
      )

    case ONBOARDING_STEPS.WAITING_FOR_TRACE:
      return (
        <Step5_WaitingForTrace
          onTraceReceived={handleTraceReceived}
          onBack={handleStep5Back}
          onSkip={() => goToStep(ONBOARDING_STEPS.NEXT_STEPS)}
        />
      )

    case ONBOARDING_STEPS.FIRST_TRACE:
      if (!firstTraceId) {
        goToStep(ONBOARDING_STEPS.WAITING_FOR_TRACE)
        return null
      }
      return (
        <Step6_FirstTrace
          traceId={firstTraceId}
          onContinue={handleStep6Continue}
        />
      )

    case ONBOARDING_STEPS.NEXT_STEPS:
      return (
        <Step7_NextSteps
          projectId={projectId}
          commitUuid={commitUuid}
          documentUuid={documentUuid}
          onComplete={handleCompleteOnboarding}
          isCompleting={isSkipping}
        />
      )

    default:
      return <Step0_WhatIsLatitude onContinue={handleStep0Continue} />
  }
}

