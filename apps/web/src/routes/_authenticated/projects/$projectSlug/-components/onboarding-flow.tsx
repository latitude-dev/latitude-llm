import { useMountEffect, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { useHasFeatureFlag } from "../../../../../domains/feature-flags/feature-flags.collection.ts"
import { invalidateProjectFlaggers, useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import {
  configureProjectFlaggersForOnboarding,
  listAvailableFlaggers,
} from "../../../../../domains/flaggers/flaggers.functions.ts"
import type { FlaggerPresetSlug } from "../../../../../domains/flaggers/presets.ts"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"
import { submitOnboarding } from "../../../../../domains/users/user.functions.ts"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../../lib/form-server-action.ts"
import { CarouselSlide, CarouselTrack } from "./onboarding/carousel-track.tsx"
import { OnboardingGallery } from "./onboarding/onboarding-gallery.tsx"
import * as FlaggersStep from "./onboarding/steps/flaggers-step.tsx"
import * as RoleStep from "./onboarding/steps/role-step.tsx"
import * as SlackStep from "./onboarding/steps/slack-step.tsx"
import type { StackChoice } from "./onboarding/steps/stack-step.tsx"
import * as StackStep from "./onboarding/steps/stack-step.tsx"
import * as TelemetryStep from "./onboarding/steps/telemetry-step.tsx"

export const ONBOARDING_STEPS = ["role", "stack", "flaggers", "slack", "telemetry"] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

type OnboardingFormValues = { jobTitle: string; phoneNumber: string }

// Helper exists purely for type inference — `useForm` has 12 generic parameters and
// `ReturnType<typeof useForm<T>>` doesn't auto-default the rest. Calling it here in a
// never-invoked function lets TS infer the full instance type from the actual call shape.
function _onboardingFormTypeHelper() {
  return useForm({
    defaultValues: { jobTitle: "", phoneNumber: "" } as OnboardingFormValues,
  })
}
export type OnboardingForm = ReturnType<typeof _onboardingFormTypeHelper>

export function OnboardingFlow({
  projectId,
  projectSlug,
  onboardingType,
  slackEnvConfigured,
  initialStep,
  flashInstalled,
  flashError,
  onOpenProjectTraces,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly onboardingType: "code-agents" | "prod-traces" | undefined
  readonly slackEnvConfigured: boolean
  readonly initialStep?: OnboardingStep
  readonly flashInstalled?: "ok"
  readonly flashError?: "workspace_taken" | "oauth_failed"
  readonly onOpenProjectTraces: (projectId: string) => Promise<void>
}) {
  const { toast } = useToast()
  const navigate = useNavigate()

  const slackFlagEnabled = useHasFeatureFlag("slack")
  const slackStepEnabled = slackFlagEnabled && slackEnvConfigured

  // Force back to `role` if a URL deep-links past `stack` without `onboardingType` set.
  const onboardingTypeSet = onboardingType != null
  const resolvedInitialStep: OnboardingStep = (() => {
    if (initialStep == null) return "role"
    if (initialStep === "role" || initialStep === "stack") return initialStep
    if (!onboardingTypeSet) return "role"
    return initialStep
  })()

  const [step, setStep] = useState<OnboardingStep>(resolvedInitialStep)

  const goToStep = useCallback(
    (next: OnboardingStep) => {
      setStep(next)
      void navigate({
        to: "/projects/$projectSlug/onboarding",
        params: { projectSlug },
        search: (prev: Record<string, unknown>) => ({ ...prev, step: next }),
        replace: true,
      })
    },
    [navigate, projectSlug],
  )

  useMountEffect(() => {
    if (!flashInstalled && !flashError) return
    if (flashInstalled === "ok") {
      toast({ description: "Slack connected" })
    } else if (flashError === "workspace_taken") {
      toast({
        variant: "destructive",
        description: "This Slack workspace is already connected to another Latitude organization.",
      })
    } else if (flashError === "oauth_failed") {
      toast({
        variant: "destructive",
        description: "Couldn't complete the Slack install. Please try again.",
      })
    }
    void navigate({
      to: "/projects/$projectSlug/onboarding",
      params: { projectSlug },
      search: ({ installed: _installed, error: _error, ...rest }: Record<string, unknown>) => rest,
      replace: true,
    })
  })

  const [stackChoice, setStackChoice] = useState<StackChoice | null>(null)
  const [selectedFlaggerSlugs, setSelectedFlaggerSlugs] = useState<ReadonlySet<string> | null>(null)
  const [isSavingFlaggers, setIsSavingFlaggers] = useState(false)

  const form = useForm({
    defaultValues: {
      jobTitle: "",
      phoneNumber: "",
    } satisfies OnboardingFormValues,
    onSubmit: createFormSubmitHandler(
      async ({ jobTitle, phoneNumber }) => {
        const stack = stackChoice as StackChoice
        await submitOnboarding({ data: { jobTitle, phoneNumber, stackChoice: stack, projectId } })
      },
      {
        onSuccess: () => goToStep("flaggers"),
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  const handleAdvanceFromRole = async () => {
    await form.validateField("jobTitle", "change")
    const meta = form.getFieldMeta("jobTitle")
    if (meta && meta.errors.length > 0) return
    goToStep("stack")
  }

  const handleStackContinue = () => {
    if (stackChoice === null) return
    void form.handleSubmit()
  }

  const { data: projectFlaggers = [], isLoading: isLoadingProjectFlaggers } = useProjectFlaggers(projectId)
  const { data: availableFlaggers = [], isLoading: isLoadingAvailableFlaggers } = useQuery({
    queryKey: ["availableFlaggers"],
    queryFn: () => listAvailableFlaggers(),
  })

  const availableFlaggerSlugs = availableFlaggers.map((flagger) => flagger.slug)
  const currentEnabledFlaggerSlugs = new Set(
    projectFlaggers.filter((flagger) => flagger.enabled).map((flagger) => flagger.slug),
  )
  const enabledFlaggerSlugs =
    selectedFlaggerSlugs ?? (projectFlaggers.length > 0 ? currentEnabledFlaggerSlugs : new Set(availableFlaggerSlugs))

  const toggleFlaggerSelection = (slug: string) => {
    setSelectedFlaggerSlugs((current) => {
      const next = new Set(current ?? enabledFlaggerSlugs)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  const applyFlaggerPreset = (enabledSlugs: ReadonlyArray<FlaggerPresetSlug>) => {
    setSelectedFlaggerSlugs(new Set(enabledSlugs))
  }

  const handleConfigureFlaggers = async () => {
    setIsSavingFlaggers(true)
    try {
      await configureProjectFlaggersForOnboarding({
        data: {
          projectId,
          enabledSlugs: availableFlaggerSlugs.filter((slug) => enabledFlaggerSlugs.has(slug)),
        },
      })
      await invalidateProjectFlaggers(projectId)
      goToStep(slackStepEnabled ? "slack" : "telemetry")
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingFlaggers(false)
    }
  }

  const [traceReceived, setTraceReceived] = useState(false)
  const pollTimeoutRef = useRef<number | undefined>(undefined)
  const redirectTimeoutRef = useRef<number | undefined>(undefined)
  const projectIdRef = useRef(projectId)
  const onOpenProjectTracesRef = useRef(onOpenProjectTraces)
  projectIdRef.current = projectId
  onOpenProjectTracesRef.current = onOpenProjectTraces

  useMountEffect(() => {
    let cancelled = false

    const clearTimers = () => {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = undefined
      }
      if (redirectTimeoutRef.current !== undefined) {
        window.clearTimeout(redirectTimeoutRef.current)
        redirectTimeoutRef.current = undefined
      }
    }

    const poll = async () => {
      if (cancelled) return
      try {
        const count = await countTracesByProject({
          data: { projectId: projectIdRef.current },
        })
        if (cancelled) return
        if (count > 0) {
          setTraceReceived(true)
          redirectTimeoutRef.current = window.setTimeout(() => {
            if (!cancelled) void onOpenProjectTracesRef.current(projectIdRef.current)
          }, 3000)
          return
        }
      } finally {
        if (!cancelled && redirectTimeoutRef.current === undefined) {
          pollTimeoutRef.current = window.setTimeout(() => void poll(), 3000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      clearTimers()
    }
  })

  const handleSkipToTraces = () => {
    void onOpenProjectTraces(projectId)
  }

  const telemetryBackStep: OnboardingStep = slackStepEnabled ? "slack" : "flaggers"

  // Right-pane slides. `role` and `stack` share one "intro" slide so the gallery stays put
  // across the first two steps; the pane first slides when entering `flaggers`.
  type RightSlide = "intro" | "flaggers" | "slack" | "telemetry"
  const STEP_TO_RIGHT_SLIDE: Record<OnboardingStep, RightSlide> = {
    role: "intro",
    stack: "intro",
    flaggers: "flaggers",
    slack: "slack",
    telemetry: "telemetry",
  }
  const visibleRightSlides: ReadonlyArray<RightSlide> = slackStepEnabled
    ? ["intro", "flaggers", "slack", "telemetry"]
    : ["intro", "flaggers", "telemetry"]
  const activeRightSlideIndex = Math.max(0, visibleRightSlides.indexOf(STEP_TO_RIGHT_SLIDE[step]))

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto overscroll-y-contain px-6 pt-12 pb-16 sm:px-12 sm:pt-16 sm:pb-20 lg:w-1/2 lg:border-r lg:border-border lg:px-24 lg:pt-24 lg:pb-32 [scrollbar-gutter:stable]">
        {step === "role" ? (
          <RoleStep.Left form={form} onNext={() => void handleAdvanceFromRole()} />
        ) : step === "stack" ? (
          <StackStep.Left
            stackChoice={stackChoice}
            setStackChoice={setStackChoice}
            isSubmitting={form.state.isSubmitting}
            onBack={() => goToStep("role")}
            onContinue={handleStackContinue}
          />
        ) : step === "flaggers" ? (
          <FlaggersStep.Left
            availableFlaggers={availableFlaggers}
            isLoadingAvailableFlaggers={isLoadingAvailableFlaggers}
            isLoadingProjectFlaggers={isLoadingProjectFlaggers}
            enabledFlaggerSlugs={enabledFlaggerSlugs}
            toggleFlaggerSelection={toggleFlaggerSelection}
            applyFlaggerPreset={applyFlaggerPreset}
            isSavingFlaggers={isSavingFlaggers}
            onBack={() => goToStep("stack")}
            onContinue={() => void handleConfigureFlaggers()}
          />
        ) : step === "slack" ? (
          <SlackStep.Left
            projectSlug={projectSlug}
            onBack={() => goToStep("flaggers")}
            onContinue={() => goToStep("telemetry")}
          />
        ) : (
          <TelemetryStep.Left
            stackChoice={stackChoice}
            traceReceived={traceReceived}
            projectSlug={projectSlug}
            onBack={() => goToStep(telemetryBackStep)}
            onSkip={handleSkipToTraces}
          />
        )}
      </div>

      <div className="hidden h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-secondary lg:flex lg:w-1/2">
        <CarouselTrack activeIndex={activeRightSlideIndex}>
          {visibleRightSlides.map((slide) => (
            <CarouselSlide key={slide}>
              {slide === "intro" ? (
                <OnboardingGallery />
              ) : slide === "flaggers" ? (
                <FlaggersStep.Right enabledFlaggerSlugs={enabledFlaggerSlugs} availableFlaggers={availableFlaggers} />
              ) : slide === "slack" ? (
                <SlackStep.Right isActive={step === "slack"} />
              ) : (
                <TelemetryStep.Right traceReceived={traceReceived} />
              )}
            </CarouselSlide>
          ))}
        </CarouselTrack>
      </div>
    </div>
  )
}
