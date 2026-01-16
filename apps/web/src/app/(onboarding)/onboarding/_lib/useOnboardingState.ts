'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  useLocalStorage,
  AppLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'

export const ONBOARDING_STEPS = {
  ROLE_SELECTION: 0,
  AI_USAGE: 1,
  LATITUDE_GOALS: 2,
  WHAT_IS_LATITUDE: 3,
  RELIABILITY_LOOP: 4,
  CONNECT_CHOICE: 5,
  INTEGRATION: 6,
  WAITING_FOR_TRACE: 7,
  FIRST_TRACE: 8,
  NEXT_STEPS: 9,
} as const

export type OnboardingStep =
  (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS]

export type SlideshowSlide = {
  id: string
  headline: string
  body: string
  footer?: string
  image?: string
}

export const SLIDESHOW_SLIDES: SlideshowSlide[] = [
  {
    id: 'observe',
    headline: 'Trace every request',
    body: 'Capture every prompt, input, and output from your AI app. Real traces show what actually happens in production.',
    image: '/onboarding/observe.png',
  },
  {
    id: 'annotate',
    headline: 'Annotate responses',
    body: 'Your team labels responses as good, bad, or broken. This defines what quality looks like for your use case.',
    image: '/onboarding/annotate.png',
  },
  {
    id: 'discover',
    headline: 'Discover failure patterns',
    body: 'Latitude automatically groups similar failures into issues. You see recurring patterns, not one-off mistakes.',
    image: '/onboarding/discover.png',
  },
  {
    id: 'evaluate',
    headline: 'Generate evaluations',
    body: 'Create evaluations for specific issues with one click. This helps you build a complete evaluation system grounded in your real failures.',
    image: '/onboarding/evaluate.png',
  },
  {
    id: 'optimize',
    headline: 'Optimize automatically',
    body: 'Prompts are automatically optimized and evaluated to reduce failures before hitting production.',
    image: '/onboarding/optimize.png',
  },
]

type OnboardingLocalState = {
  step: OnboardingStep
  slideIndex: number
  selectedFramework: string | null
  firstTraceId: string | null
}

const DEFAULT_STATE: OnboardingLocalState = {
  step: ONBOARDING_STEPS.ROLE_SELECTION,
  slideIndex: 0,
  selectedFramework: null,
  firstTraceId: null,
}

export function useOnboardingState(shouldReset = false) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { value: localStateRaw, setValue: setLocalState } =
    useLocalStorage<OnboardingLocalState | null>({
      key: AppLocalStorage.onboardingState,
      defaultValue: DEFAULT_STATE,
    })

  const localState = shouldReset
    ? DEFAULT_STATE
    : (localStateRaw ?? DEFAULT_STATE)
  const hasResetRef = useRef(false)

  useEffect(() => {
    if (shouldReset && !hasResetRef.current) {
      hasResetRef.current = true
      setLocalState(DEFAULT_STATE)
    }
  }, [shouldReset, setLocalState])

  const stepFromUrl = searchParams.get('step')
  const slideFromUrl = searchParams.get('slide')
  const frameworkFromUrl = searchParams.get('framework')

  const hasInitializedUrlRef = useRef(false)
  useEffect(() => {
    if (!hasInitializedUrlRef.current && stepFromUrl === null && !shouldReset) {
      hasInitializedUrlRef.current = true
      const params = new URLSearchParams()
      params.set('step', localState.step.toString())
      router.replace(`/onboarding?${params.toString()}`, { scroll: false })
    }
  }, [stepFromUrl, localState.step, router, shouldReset])

  // Derive current step from URL first, then localStorage
  let currentStep: OnboardingStep = localState.step
  if (shouldReset) {
    currentStep = ONBOARDING_STEPS.ROLE_SELECTION
  } else if (stepFromUrl !== null) {
    const parsed = parseInt(stepFromUrl, 10)

    if (
      !isNaN(parsed) &&
      parsed >= 0 &&
      parsed <= ONBOARDING_STEPS.NEXT_STEPS
    ) {
      currentStep = parsed as OnboardingStep
    }
  }

  // Derive slide index from URL first, then localStorage
  let currentSlideIndex = localState.slideIndex
  if (slideFromUrl !== null) {
    const parsed = parseInt(slideFromUrl, 10)
    if (!isNaN(parsed) && parsed >= 0 && parsed < SLIDESHOW_SLIDES.length) {
      currentSlideIndex = parsed
    }
  }

  // Derive selected framework from URL - if we're on integration step and URL has no framework, show gallery
  // Only fall back to localStorage if there's no step in URL (initial load)
  let selectedFramework: string | null = null
  if (stepFromUrl !== null) {
    // URL is the source of truth - use framework from URL (or null if not present)
    selectedFramework = frameworkFromUrl
  } else {
    // No step in URL, use localStorage
    selectedFramework = localState.selectedFramework
  }

  const updateUrl = useCallback(
    (
      step: OnboardingStep,
      slideIndex?: number,
      framework?: string | null,
      replace = false,
    ) => {
      const params = new URLSearchParams()
      params.set('step', step.toString())
      if (
        step === ONBOARDING_STEPS.RELIABILITY_LOOP &&
        slideIndex !== undefined
      ) {
        params.set('slide', slideIndex.toString())
      }
      if (step === ONBOARDING_STEPS.INTEGRATION && framework) {
        params.set('framework', framework)
      }
      const url = `/onboarding?${params.toString()}`
      if (replace) {
        router.replace(url, { scroll: false })
      } else {
        router.push(url, { scroll: false })
      }
    },
    [router],
  )

  const goToStep = useCallback(
    (step: OnboardingStep) => {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        step,
        slideIndex: 0,
        selectedFramework: null,
      }))
      updateUrl(step, 0, null)
    },
    [setLocalState, updateUrl],
  )

  const nextStep = useCallback(() => {
    const next = Math.min(
      currentStep + 1,
      ONBOARDING_STEPS.NEXT_STEPS,
    ) as OnboardingStep
    goToStep(next)
  }, [currentStep, goToStep])

  const prevStep = useCallback(() => {
    const prev = Math.max(
      currentStep - 1,
      ONBOARDING_STEPS.ROLE_SELECTION,
    ) as OnboardingStep
    goToStep(prev)
  }, [currentStep, goToStep])

  const nextSlide = useCallback(() => {
    const nextIndex = currentSlideIndex + 1
    if (nextIndex >= SLIDESHOW_SLIDES.length) {
      goToStep(ONBOARDING_STEPS.CONNECT_CHOICE)
    } else {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        slideIndex: nextIndex,
      }))
      updateUrl(ONBOARDING_STEPS.RELIABILITY_LOOP, nextIndex)
    }
  }, [currentSlideIndex, goToStep, setLocalState, updateUrl])

  const prevSlide = useCallback(() => {
    const prevIndex = currentSlideIndex - 1
    if (prevIndex < 0) {
      goToStep(ONBOARDING_STEPS.WHAT_IS_LATITUDE)
    } else {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        slideIndex: prevIndex,
      }))
      updateUrl(ONBOARDING_STEPS.RELIABILITY_LOOP, prevIndex)
    }
  }, [currentSlideIndex, goToStep, setLocalState, updateUrl])

  const goToStepWithoutReset = useCallback(
    (step: OnboardingStep) => {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        step,
      }))
      updateUrl(step, currentSlideIndex, selectedFramework)
    },
    [setLocalState, updateUrl, currentSlideIndex, selectedFramework],
  )

  const setSelectedFramework = useCallback(
    (framework: string | null) => {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        selectedFramework: framework,
      }))
      updateUrl(ONBOARDING_STEPS.INTEGRATION, undefined, framework)
    },
    [setLocalState, updateUrl],
  )

  const setFirstTraceId = useCallback(
    (traceId: string | null) => {
      setLocalState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        firstTraceId: traceId,
      }))
    },
    [setLocalState],
  )

  const resetOnboarding = useCallback(() => {
    setLocalState(DEFAULT_STATE)
    updateUrl(ONBOARDING_STEPS.ROLE_SELECTION, 0, null, true)
  }, [setLocalState, updateUrl])

  return {
    currentStep,
    currentSlideIndex,
    currentSlide: SLIDESHOW_SLIDES[currentSlideIndex],
    totalSlides: SLIDESHOW_SLIDES.length,
    selectedFramework,
    firstTraceId: localState.firstTraceId,
    goToStep,
    goToStepWithoutReset,
    nextStep,
    prevStep,
    nextSlide,
    prevSlide,
    setSelectedFramework,
    setFirstTraceId,
    resetOnboarding,
    isFirstSlide: currentSlideIndex === 0,
    isLastSlide: currentSlideIndex === SLIDESHOW_SLIDES.length - 1,
  }
}
