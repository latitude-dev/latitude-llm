import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { Button, CopyableText, HistogramSkeleton, Icon, Sheet, Skeleton, Text, useMountEffect } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowRightIcon, CheckIcon, Loader2Icon, TelescopeIcon, XIcon } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useApiKeysCollection } from "../../../../../domains/api-keys/api-keys.collection.ts"
import type { ProjectRecord } from "../../../../../domains/projects/projects.functions.ts"
import { countTracesByProject } from "../../../../../domains/traces/traces.functions.ts"
import type { StackChoice } from "./onboarding/steps/stack-step.tsx"
import { TelemetryInstructions } from "./onboarding/steps/telemetry-instructions.tsx"

/** Map the project's persisted onboarding type to the telemetry-step stack variant. */
function stackChoiceFromOnboardingType(onboardingType: ProjectRecord["settings"]["onboardingType"]): StackChoice {
  return onboardingType === "code-agents" ? "coding-agent-machine" : "production-agent"
}

/**
 * Empty state for a project that has never received a trace. Keeps the surface
 * calm: a faint skeleton of the trace list signals "your traces show up here",
 * while a compact card surfaces the two essentials (slug + API key) and a CTA
 * that opens the full install instructions in a side sheet. Meanwhile it polls
 * for the first trace and transitions into the populated table once one lands.
 *
 * When the organization already has other connected projects, the copy leads
 * with "point some traffic to this slug" (that user already has instrumentation
 * and just needs to retarget it); otherwise it frames a first-time setup.
 */
export function TracesEmptyOnboarding({
  project,
  orgHasConnectedProjects,
}: {
  readonly project: ProjectRecord
  readonly orgHasConnectedProjects: boolean
}) {
  const queryClient = useQueryClient()
  const stackChoice = stackChoiceFromOnboardingType(project.settings.onboardingType)

  const [traceReceived, setTraceReceived] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const pollTimeoutRef = useRef<number | undefined>(undefined)
  const transitionTimeoutRef = useRef<number | undefined>(undefined)
  const projectIdRef = useRef(project.id)
  projectIdRef.current = project.id

  // Poll for the first trace (same cadence as the onboarding flow). Once a
  // trace lands, flash a confirmation, then invalidate the projects + traces
  // caches so the page re-renders into the normal traces table.
  useMountEffect(() => {
    let cancelled = false

    const clearTimers = () => {
      if (pollTimeoutRef.current !== undefined) {
        window.clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = undefined
      }
      if (transitionTimeoutRef.current !== undefined) {
        window.clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = undefined
      }
    }

    const poll = async () => {
      if (cancelled) return
      try {
        const count = await countTracesByProject({ data: { projectId: projectIdRef.current } })
        if (cancelled) return
        if (count > 0) {
          setTraceReceived(true)
          transitionTimeoutRef.current = window.setTimeout(() => {
            if (cancelled) return
            void queryClient.invalidateQueries({ queryKey: ["projects"] })
            void queryClient.invalidateQueries({ queryKey: ["traces-count"] })
          }, 1500)
          return
        }
      } finally {
        if (!cancelled && transitionTimeoutRef.current === undefined) {
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

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Layer 1: a full skeleton of the page, rendered at normal strength. */}
      <TracesSkeletonBackdrop />
      {/* Layer 2: gradient that fades the skeleton into the page background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background"
      />
      {/* Layer 2b: radial scrim — solid background behind the content that
          dissolves into the skeleton with no edge, so it grounds the content
          without reading as a card or modal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background [-webkit-mask-image:radial-gradient(ellipse_70%_55%_at_50%_50%,black_35%,transparent_72%)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_50%,black_35%,transparent_72%)]"
      />
      {/* Layer 3: the actual centered content. */}
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-8">
        <ConnectCard
          project={project}
          orgHasConnectedProjects={orgHasConnectedProjects}
          traceReceived={traceReceived}
          onOpenSetup={() => setSetupOpen(true)}
        />
      </div>
      <TracesSetupSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        stackChoice={stackChoice}
        projectSlug={project.slug}
      />
    </div>
  )
}

/**
 * Decorative, non-interactive skeleton of the real Traces page — the aggregations
 * panel (metric tiles + histogram) on top, the trace list below — so the user sees
 * the shape of what will appear here. Rendered at normal strength; the gradient
 * layer above handles fading it into the background.
 */
function TracesSkeletonBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="flex flex-col gap-4 p-6">
        {/* Aggregations panel: metric tiles + histogram. */}
        <div className="flex flex-col gap-3 rounded-lg bg-secondary p-2">
          <div className="flex flex-row gap-2 overflow-hidden">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={`metric-tile-${i}`}
                className="flex basis-[176px] min-w-[176px] shrink-0 flex-col gap-2 rounded-md p-2"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
          <HistogramSkeleton />
        </div>

        {/* Trace list rows. */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={`trace-row-${i}`}
              className="flex flex-row items-center gap-4 rounded-lg border border-border/50 px-4 py-3"
            >
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-44" />
              <div className="ml-auto flex flex-row items-center gap-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConnectCard({
  project,
  orgHasConnectedProjects,
  traceReceived,
  onOpenSetup,
}: {
  readonly project: ProjectRecord
  readonly orgHasConnectedProjects: boolean
  readonly traceReceived: boolean
  readonly onOpenSetup: () => void
}) {
  const { data: apiKeysList } = useApiKeysCollection()
  const defaultApiKeyToken = useMemo(() => {
    const keys = apiKeysList ?? []
    return keys.find((k) => k.name === DEFAULT_API_KEY_NAME)?.token ?? null
  }, [apiKeysList])

  const headline = orgHasConnectedProjects ? "Send traces to this project" : "Waiting for your first trace"
  const subcopy = orgHasConnectedProjects
    ? "Your organization already sends traces to Latitude. Point some of your traffic to this project's slug — or set it up from scratch."
    : "This is where your traces will appear. Instrument your app with Latitude to start streaming them in."
  const ctaLabel = orgHasConnectedProjects ? "Full setup instructions" : "Set up tracing"

  return (
    <div className="flex w-full max-w-md flex-col items-start gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon icon={TelescopeIcon} size="lg" color="foregroundMuted" />
      </div>

      <div className="flex flex-col gap-2">
        <Text.H3 weight="medium">{headline}</Text.H3>
        <Text.H5 color="foregroundMuted">{subcopy}</Text.H5>
      </div>

      <TraceWaitingIndicator traceReceived={traceReceived} />

      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-row items-center gap-2">
          <Text.H6 color="foregroundMuted">Project slug</Text.H6>
          <CopyableText value={project.slug} size="sm" ellipsis tooltip="Copy project slug" />
        </div>
        <div className="flex flex-row items-center gap-2">
          <Text.H6 color="foregroundMuted">API key</Text.H6>
          {defaultApiKeyToken ? (
            <CopyableText value={defaultApiKeyToken} size="sm" ellipsis tooltip="Copy API key" />
          ) : (
            <Text.H6 color="foregroundMuted">Use any key from Settings → API Keys.</Text.H6>
          )}
        </div>
      </div>

      <Button onClick={onOpenSetup}>
        {ctaLabel}
        <Icon icon={ArrowRightIcon} size="sm" />
      </Button>
    </div>
  )
}

function TraceWaitingIndicator({ traceReceived }: { readonly traceReceived: boolean }) {
  return (
    <div className="flex flex-row items-center gap-2">
      {traceReceived ? (
        <Icon icon={CheckIcon} size="sm" color="success" />
      ) : (
        <Icon icon={Loader2Icon} size="sm" color="foregroundMuted" className="animate-spin" />
      )}
      <Text.H5 color={traceReceived ? "success" : "foregroundMuted"}>
        {traceReceived ? "Your first trace just arrived" : "Waiting for your first trace…"}
      </Text.H5>
    </div>
  )
}

/** Side sheet holding the full install instructions, opened from the connect card. */
function TracesSetupSheet({
  open,
  onClose,
  stackChoice,
  projectSlug,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly stackChoice: StackChoice
  readonly projectSlug: string
}) {
  return (
    <Sheet open={open} onClose={onClose} closeAriaLabel="Close setup panel">
      <div className="flex h-full w-screen max-w-[600px] flex-col bg-background">
        <div className="flex shrink-0 flex-row items-center justify-between border-b border-border px-6 py-4">
          <Text.H4 weight="medium">Set up tracing</Text.H4>
          <Button variant="outline" className="h-8 w-8 p-0" onClick={onClose}>
            <Icon icon={XIcon} size="sm" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
          <TelemetryInstructions stackChoice={stackChoice} projectSlug={projectSlug} />
        </div>
      </div>
    </Sheet>
  )
}
