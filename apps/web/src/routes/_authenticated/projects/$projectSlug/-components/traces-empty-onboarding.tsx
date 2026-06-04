import { DEFAULT_API_KEY_NAME } from "@domain/api-keys"
import { CodeBlock, Icon, Text, useMountEffect } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, Loader2Icon } from "lucide-react"
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
 * Onboarding-style empty state for a project that has never received a trace.
 * Mirrors the onboarding telemetry step: it shows install/connect instructions
 * and polls for the first trace, transitioning into the populated table the
 * moment one arrives.
 *
 * When the organization already has other connected projects, it leads with a
 * lighter "point some traffic to this project's slug" experience — that user
 * almost certainly already has instrumentation and just needs to target a new
 * slug — with the full setup tucked behind a disclosure.
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
  const [showFullSetup, setShowFullSetup] = useState(false)
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
    <div className="h-full w-full overflow-y-auto overscroll-y-contain p-8 [scrollbar-gutter:stable]">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Text.H2 weight="medium">
            {traceReceived ? "Trace received. Loading…" : "Connect this project to start receiving traces"}
          </Text.H2>
          <Text.H4 color="foregroundMuted">
            {orgHasConnectedProjects
              ? "Your organization is already sending traces to Latitude. Point some of your traffic to this project's slug, or set it up from scratch below."
              : "Traces capture every LLM call your application makes. Follow the steps below to start streaming them into this project."}
          </Text.H4>
          <TraceWaitingIndicator traceReceived={traceReceived} />
        </div>

        {orgHasConnectedProjects ? (
          <AdditionalProjectInstructions
            project={project}
            stackChoice={stackChoice}
            showFullSetup={showFullSetup}
            onToggleFullSetup={() => setShowFullSetup((open) => !open)}
          />
        ) : (
          <TelemetryInstructions stackChoice={stackChoice} projectSlug={project.slug} />
        )}
      </div>
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

/**
 * Slug-forward variant for projects in an org that already has traces flowing.
 * Leads with the project slug + default key (the only things that change when
 * retargeting existing instrumentation), with full setup behind a disclosure.
 */
function AdditionalProjectInstructions({
  project,
  stackChoice,
  showFullSetup,
  onToggleFullSetup,
}: {
  readonly project: ProjectRecord
  readonly stackChoice: StackChoice
  readonly showFullSetup: boolean
  readonly onToggleFullSetup: () => void
}) {
  const { data: apiKeysList } = useApiKeysCollection()
  const defaultApiKeyToken = useMemo(() => {
    const keys = apiKeysList ?? []
    return keys.find((k) => k.name === DEFAULT_API_KEY_NAME)?.token ?? null
  }, [apiKeysList])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <Text.H5M>Send traces to this project</Text.H5M>
          <Text.H5 color="foregroundMuted">
            Set the project to this slug (or send the <code className="text-xs">X-Latitude-Project</code> header with
            it) on the traffic you want to land here. Keep using your existing Latitude API key.
          </Text.H5>
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Project slug</Text.H5M>
          <CodeBlock value={project.slug} copyable />
        </div>

        <div className="flex flex-col gap-2">
          <Text.H5M>Latitude API key</Text.H5M>
          {defaultApiKeyToken ? (
            <CodeBlock value={defaultApiKeyToken} copyable />
          ) : (
            <Text.H5 color="foregroundMuted">
              Use any Latitude API key from Settings → API Keys (the same one your other projects already use).
            </Text.H5>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onToggleFullSetup}
          className="flex w-fit cursor-pointer flex-row items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon icon={showFullSetup ? ChevronDownIcon : ChevronRightIcon} size="sm" />
          <Text.H5>First time setting up? Full installation instructions</Text.H5>
        </button>
        {showFullSetup ? (
          <div className="flex flex-col gap-6">
            <TelemetryInstructions stackChoice={stackChoice} projectSlug={project.slug} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
