import { useMountEffect, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useCallback, useRef, useState } from "react"
import { invalidateProjectFlaggers, useProjectFlaggers } from "../../../../../domains/flaggers/flaggers.collection.ts"
import {
  configureProjectFlaggersForOnboarding,
  listAvailableFlaggers,
} from "../../../../../domains/flaggers/flaggers.functions.ts"
import type { FlaggerPresetSlug } from "../../../../../domains/flaggers/presets.ts"
import { useProjectsCollection } from "../../../../../domains/projects/projects.collection.ts"
import { completeProjectOnboarding, updateProject } from "../../../../../domains/projects/projects.functions.ts"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"
import { submitOnboarding } from "../../../../../domains/users/user.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { createFormSubmitHandler } from "../../../../../lib/form-server-action.ts"
import { OnboardingRightPane } from "./onboarding/onboarding-right-pane.tsx"
import * as FlaggersStep from "./onboarding/steps/flaggers-step.tsx"
import * as RoleStep from "./onboarding/steps/role-step.tsx"
import * as SlackStep from "./onboarding/steps/slack-step.tsx"
import * as TelemetryStep from "./onboarding/steps/telemetry-step.tsx"

export const ONBOARDING_STEPS = ["role", "flaggers", "slack", "telemetry"] as const
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
  projectName: initialProjectName,
  persistedProjectName,
  slackEnvConfigured,
  initialStep,
  flashInstalled,
  flashError,
  onOpenProjectTraces,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly projectName: string
  readonly persistedProjectName: string
  readonly slackEnvConfigured: boolean
  readonly initialStep?: OnboardingStep
  readonly flashInstalled?: "ok"
  readonly flashError?: string
  readonly onOpenProjectTraces: (projectId: string) => Promise<void>
}) {
  const { toast } = useToast()
  const navigate = useNavigate()

  const slackStepEnabled = slackEnvConfigured

  const resolvedInitialStep: OnboardingStep = initialStep ?? "role"

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

  const [projectName, setProjectName] = useState(initialProjectName)
  const [selectedFlaggerSlugs, setSelectedFlaggerSlugs] = useState<ReadonlySet<string> | null>(null)
  const [isSavingFlaggers, setIsSavingFlaggers] = useState(false)
  const { data: allProjects = [] } = useProjectsCollection()
  const sampleProject = allProjects.find((project) => project.id !== projectId && project.settings.isSample === true)

  const form = useForm({
    defaultValues: {
      jobTitle: "",
      phoneNumber: "",
    } satisfies OnboardingFormValues,
    onSubmit: createFormSubmitHandler(
      async ({ jobTitle, phoneNumber }) => {
        await submitOnboarding({
          data: { jobTitle, phoneNumber, stackChoice: "production-agent", projectId },
        })
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
    const trimmedProjectName = projectName.trim()
    if (!trimmedProjectName) {
      toast({ variant: "destructive", description: "Project name is required" })
      return
    }

    setIsSavingFlaggers(true)
    try {
      if (trimmedProjectName !== persistedProjectName) {
        await updateProject({ data: { id: projectId, name: trimmedProjectName } })
        await getQueryClient().invalidateQueries({ queryKey: ["projects"] })
      }
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

  const handleOpenSampleProject = async () => {
    if (!sampleProject) return
    try {
      await completeProjectOnboarding({ data: { projectId } })
      await getQueryClient().invalidateQueries({ queryKey: ["projects"] })
      await navigate({ to: "/projects/$projectSlug", params: { projectSlug: sampleProject.slug } })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    }
  }

  const telemetryBackStep: OnboardingStep = slackStepEnabled ? "slack" : "flaggers"

  const activeSteps: ReadonlyArray<OnboardingStep> = slackStepEnabled
    ? ["role", "flaggers", "slack", "telemetry"]
    : ["role", "flaggers", "telemetry"]

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-row overflow-hidden bg-background">
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto overscroll-y-contain px-6 pt-12 pb-16 sm:px-12 sm:pt-16 sm:pb-20 lg:w-1/2 lg:border-r lg:border-border lg:px-24 lg:pt-24 lg:pb-32 [scrollbar-gutter:stable]">
        {step === "role" ? (
          <RoleStep.Left
            form={form}
            isSubmitting={form.state.isSubmitting}
            onNext={() => void handleAdvanceFromRole()}
          />
        ) : step === "flaggers" ? (
          <FlaggersStep.Left
            availableFlaggers={availableFlaggers}
            isLoadingAvailableFlaggers={isLoadingAvailableFlaggers}
            isLoadingProjectFlaggers={isLoadingProjectFlaggers}
            enabledFlaggerSlugs={enabledFlaggerSlugs}
            toggleFlaggerSelection={toggleFlaggerSelection}
            applyFlaggerPreset={applyFlaggerPreset}
            projectName={projectName}
            onProjectNameChange={setProjectName}
            isSavingFlaggers={isSavingFlaggers}
            onBack={() => goToStep("role")}
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
            traceReceived={traceReceived}
            projectSlug={projectSlug}
            sampleProjectSlug={sampleProject?.slug}
            onBack={() => goToStep(telemetryBackStep)}
            onOpenSampleProject={() => void handleOpenSampleProject()}
          />
        )}
      </div>

      <OnboardingRightPane
        steps={activeSteps}
        currentStep={step}
        enabledFlaggerSlugs={enabledFlaggerSlugs}
        availableFlaggers={availableFlaggers}
        traceReceived={traceReceived}
      />
    </div>
  )
}
