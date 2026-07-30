import { Button, Icon, LatitudeLogo, Text, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"
import { AlertCircle } from "lucide-react"
import { type SubmitEvent, useState } from "react"
import { invalidateProjectFlaggers, useProjectFlaggers } from "../domains/flaggers/flaggers.collection.ts"
import { configureProjectFlaggersForOnboarding, listAvailableFlaggers } from "../domains/flaggers/flaggers.functions.ts"
import type { FlaggerPresetSlug } from "../domains/flaggers/presets.ts"
import { isSlackConfigured } from "../domains/integrations/integrations.functions.ts"
import { claimOrganization, getClaimPreview } from "../domains/organizations/claim.functions.ts"
import { listOrganizations, updateOrganization } from "../domains/organizations/organizations.functions.ts"
import {
  completeProjectOnboarding,
  listProjects,
  type ProjectRecord,
  updateProject,
} from "../domains/projects/projects.functions.ts"
import { getSession, updateUserName } from "../domains/sessions/session.functions.ts"
import { submitOnboarding } from "../domains/users/user.functions.ts"
import { getQueryClient } from "../lib/data/query-client.tsx"
import { toUserMessage } from "../lib/errors.ts"
import { createFormSubmitHandler } from "../lib/form-server-action.ts"
import { composePhoneNumber } from "../lib/phone-countries.ts"
import { OnboardingRightPane } from "./_authenticated/projects/$projectSlug/-components/onboarding/onboarding-right-pane.tsx"
import * as FlaggersStep from "./_authenticated/projects/$projectSlug/-components/onboarding/steps/flaggers-step.tsx"
import * as RoleStep from "./_authenticated/projects/$projectSlug/-components/onboarding/steps/role-step.tsx"
import {
  EMPTY_ONBOARDING_FORM_VALUES,
  requiredRoleStepFields,
  resolveHeardAboutUs,
} from "./_authenticated/projects/$projectSlug/-components/onboarding/steps/role-step-form.ts"
import * as SlackStep from "./_authenticated/projects/$projectSlug/-components/onboarding/steps/slack-step.tsx"

export const Route = createFileRoute("/claim/$token")({
  loader: async ({ params: { token } }) => {
    const preview = await getClaimPreview({ data: { token } })
    if (!preview) {
      throw redirect({ to: "/" })
    }

    const session = await getSession().catch(() => null)
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: `/claim/${token}` } })
    }

    // New user = belongs to no org yet (the owner-less temp org isn't a membership until claimed).
    const organizations = await listOrganizations().catch(() => [])
    const slackEnvConfigured = await isSlackConfigured().catch(() => false)

    return { preview, session, isExistingUser: organizations.length > 0, slackEnvConfigured }
  },
  component: ClaimPage,
})

function ClaimPage() {
  const { token } = Route.useParams()
  const { preview, session, isExistingUser, slackEnvConfigured } = Route.useLoaderData()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [name, setName] = useState("")
  const [organizationName, setOrganizationName] = useState(preview.organizationName)
  const [onboardingProject, setOnboardingProject] = useState<ProjectRecord | null>(null)

  const userHasName = Boolean(session.user.name && session.user.name.trim().length > 0)

  const handleClaim = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(undefined)

    try {
      if (!userHasName && name.trim()) {
        await updateUserName({ data: { name: name.trim() } })
      }

      await claimOrganization({ data: { token } })

      const trimmedOrgName = organizationName.trim()
      if (trimmedOrgName && trimmedOrgName !== preview.organizationName) {
        await updateOrganization({ data: { name: trimmedOrgName } })
      }

      if (isExistingUser) {
        await router.navigate({ to: "/" })
        return
      }

      // The sample project is seeded in the background, so the agent's real project is the only non-sample one now.
      const projects = await listProjects()
      const project = projects.find((p) => p.settings?.isSample !== true) ?? projects[0]
      if (!project) {
        await router.navigate({ to: "/" })
        return
      }
      setOnboardingProject(project)
    } catch (err) {
      setError(toUserMessage(err))
      setIsSubmitting(false)
    }
  }

  if (onboardingProject) {
    return <ClaimOnboarding project={onboardingProject} slackEnvConfigured={slackEnvConfigured} />
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="flex flex-col gap-y-6 max-w-88 w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          <div className="flex flex-col items-center justify-center gap-y-2">
            <Text.H3 align="center">Claim your organization</Text.H3>
            <Text.H5 color="foregroundMuted" align="center">
              {userHasName ? "Your new organization has been set up for you" : "Tell us a bit about yourself"}
            </Text.H5>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-xl overflow-hidden shadow-none bg-muted/50 border border-border p-6">
          <form onSubmit={handleClaim} className="flex flex-col gap-4">
            {!userHasName && (
              <label htmlFor="name" className="flex flex-col gap-2">
                <Text.H6 weight="medium">Your name</Text.H6>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Ex.: John Doe"
                  required
                  autoComplete="name"
                  data-autofocus="true"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </label>
            )}

            <label htmlFor="organizationName" className="flex flex-col gap-2">
              <Text.H6 weight="medium">Organization name</Text.H6>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                placeholder="Ex.: Acme Inc."
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="flex w-full border border-input bg-background rounded-lg text-sm leading-5 px-3 py-2 h-9 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </label>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <Icon icon={AlertCircle} className="h-4 w-4" />
                <Text.H6 color="destructive">{error}</Text.H6>
              </div>
            )}

            <Button
              size="full"
              type="submit"
              disabled={isSubmitting}
              className="relative w-full inline-flex items-center justify-center rounded-lg text-sm font-semibold leading-5 text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none h-9 px-3 py-2 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)] active:translate-y-px active:shadow-none transition-all"
            >
              {isSubmitting ? "Claiming…" : isExistingUser ? "Claim organization" : "Continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

type ClaimOnboardingStep = "role" | "flaggers" | "slack"

function ClaimOnboarding({
  project,
  slackEnvConfigured,
}: {
  readonly project: ProjectRecord
  readonly slackEnvConfigured: boolean
}) {
  const { toast } = useToast()
  const router = useRouter()
  const [step, setStep] = useState<ClaimOnboardingStep>("role")
  const [projectName, setProjectName] = useState(project.name)
  const [selectedFlaggerSlugs, setSelectedFlaggerSlugs] = useState<ReadonlySet<string> | null>(null)
  const [isSavingFlaggers, setIsSavingFlaggers] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  const complete = async () => {
    setIsCompleting(true)
    try {
      await completeProjectOnboarding({ data: { projectId: project.id } })
      await getQueryClient().invalidateQueries({ queryKey: ["projects"] })
      await router.navigate({ to: "/" })
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
      setIsCompleting(false)
    }
  }

  const form = useForm({
    defaultValues: EMPTY_ONBOARDING_FORM_VALUES,
    onSubmit: createFormSubmitHandler(
      async (values) => {
        const heardAboutUs = resolveHeardAboutUs(values)
        // `handleAdvanceFromRole` gates on this, so an empty answer here would
        // mean a programming error rather than user input.
        if (heardAboutUs === "") return
        await submitOnboarding({
          data: {
            jobTitle: values.jobTitle,
            phoneNumber: composePhoneNumber(values.phoneCallingCode, values.phoneNumber),
            heardAboutUs,
            stackChoice: "production-agent",
            projectId: project.id,
          },
        })
      },
      {
        onSuccess: () => setStep("flaggers"),
        onError: (error) => {
          toast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  const handleAdvanceFromRole = async () => {
    const fields = requiredRoleStepFields(form.state.values)
    await Promise.all(fields.map((field) => form.validateField(field, "change")))
    const hasErrors = fields.some((field) => (form.getFieldMeta(field)?.errors.length ?? 0) > 0)
    if (hasErrors) return
    void form.handleSubmit()
  }

  const { data: projectFlaggers = [], isLoading: isLoadingProjectFlaggers } = useProjectFlaggers(project.id)
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
      // Rename is name-only: the slug stays fixed, so the agent's LATITUDE_PROJECT_SLUG keeps working.
      if (trimmedProjectName !== project.name) {
        await updateProject({ data: { id: project.id, name: trimmedProjectName } })
        await getQueryClient().invalidateQueries({ queryKey: ["projects"] })
      }
      await configureProjectFlaggersForOnboarding({
        data: {
          projectId: project.id,
          enabledSlugs: availableFlaggerSlugs.filter((slug) => enabledFlaggerSlugs.has(slug)),
        },
      })
      await invalidateProjectFlaggers(project.id)
      if (slackEnvConfigured) {
        setStep("slack")
      } else {
        await complete()
      }
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsSavingFlaggers(false)
    }
  }

  const activeSteps: ReadonlyArray<ClaimOnboardingStep> = slackEnvConfigured
    ? ["role", "flaggers", "slack"]
    : ["role", "flaggers"]

  return (
    <div className="flex h-screen min-h-0 w-full min-w-0 flex-row overflow-hidden bg-background">
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
            isSavingFlaggers={isSavingFlaggers || isCompleting}
            onBack={() => setStep("role")}
            onContinue={() => void handleConfigureFlaggers()}
          />
        ) : (
          <SlackStep.Left
            projectSlug={project.slug}
            onBack={() => setStep("flaggers")}
            onContinue={() => void complete()}
          />
        )}
      </div>

      <OnboardingRightPane
        steps={activeSteps}
        currentStep={step}
        enabledFlaggerSlugs={enabledFlaggerSlugs}
        availableFlaggers={availableFlaggers}
      />
    </div>
  )
}
