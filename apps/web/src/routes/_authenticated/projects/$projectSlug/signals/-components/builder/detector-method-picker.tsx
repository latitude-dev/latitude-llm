import { Icon, Text } from "@repo/ui"
import {
  ChevronRightIcon,
  ListChecksIcon,
  type LucideIcon,
  ScaleIcon,
  SearchCheckIcon,
  WandSparklesIcon,
} from "lucide-react"

type DetectorMethod = "rules" | "llm" | "advanced"

/** Single source for the intro cards and the Evaluation step's tabs: same ids, names, and summaries. */
export const DETECTOR_METHODS: ReadonlyArray<{
  readonly id: DetectorMethod
  readonly icon: LucideIcon
  readonly title: string
  readonly summary: string
}> = [
  {
    id: "rules",
    icon: ListChecksIcon,
    title: "Set of conditions",
    summary:
      "Match concrete facts about a session — a phrase in the reply, a failed tool, latency or cost over a limit. Free and instant to run.",
  },
  {
    id: "llm",
    icon: ScaleIcon,
    title: "LLM as judge",
    summary:
      "Describe the behavior in plain English and an LLM reads each session and decides. Best for fuzzy things like tone or frustration.",
  },
  {
    id: "advanced",
    icon: WandSparklesIcon,
    title: "Custom script",
    summary:
      "An evaluation script you fully control — write it yourself, or describe what you want and Latitude writes it for you. For anything the other two can't express.",
  },
]

// Non-uniform delays so the arrivals feel organic rather than a marching wave.
const SESSION_DOT_DELAYS: ReadonlyArray<number> = [0, 2600, 1100, 3300, 1800]

// Inflow: a steady stream of neutral packets (every session gets checked). Outflow: an
// occasional blue packet (only matches continue). The periods (1.2s vs 7s vs the dots' 4s)
// are deliberately incommensurate so the scene never visibly repeats.
function FlowConnector({ kind }: { readonly kind: "inflow" | "outflow" }) {
  return (
    <div className="relative ml-8 h-3.5 w-px bg-border">
      {kind === "inflow" ? (
        <>
          <span className="-left-[1.5px] absolute top-0 h-1 w-1 animate-signal-inflow rounded-full bg-foreground/30 opacity-0 motion-reduce:hidden" />
          <span
            style={{ animationDelay: "600ms" }}
            className="-left-[1.5px] absolute top-0 h-1 w-1 animate-signal-inflow rounded-full bg-foreground/30 opacity-0 motion-reduce:hidden"
          />
        </>
      ) : (
        <span className="-left-[1.5px] absolute top-0 h-1 w-1 animate-signal-packet rounded-full bg-primary/60 opacity-0 motion-reduce:hidden" />
      )}
    </div>
  )
}

/**
 * Abstract three-stage flow: incoming sessions → the evaluation checks each → matches form the
 * signal. Deliberately non-interactive styling — dashed frame, soft fills, no solid borders or
 * shadows — so it cannot be mistaken for the method buttons below. The motion tells the story:
 * session dots phase in as they arrive, a constant stream of neutral packets feeds the
 * evaluation, and only the occasional blue packet drops into the signal bucket, whose dot pops
 * in as it lands. Static under reduced motion.
 */
function SignalFlowDiagram() {
  return (
    <div className="flex w-fit shrink-0 flex-col rounded-xl border border-dashed border-border bg-muted/20 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex w-16 shrink-0 items-center justify-center gap-1.5">
          {SESSION_DOT_DELAYS.map((delayMs, index) => (
            <span
              key={index}
              style={{ animationDelay: `${delayMs}ms` }}
              className="h-2 w-2 shrink-0 animate-signal-session rounded-full bg-foreground/15 motion-reduce:animate-none"
            />
          ))}
        </div>
        <Text.H6 color="foregroundMuted">Incoming sessions</Text.H6>
      </div>
      <FlowConnector kind="inflow" />
      <div className="flex items-center gap-3">
        <div className="flex w-16 shrink-0 justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
            <Icon icon={SearchCheckIcon} size="sm" color="foregroundMuted" />
          </span>
        </div>
        <Text.H6 color="foregroundMuted">Your evaluation checks each one</Text.H6>
      </div>
      <FlowConnector kind="outflow" />
      <div className="flex items-center gap-3">
        <div className="flex w-16 shrink-0 justify-center">
          <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary/50" />
            <span className="h-2 w-2 shrink-0 animate-signal-join rounded-full bg-primary/50 motion-reduce:animate-none" />
          </span>
        </div>
        <Text.H6 color="foregroundMuted">Matches make up the signal</Text.H6>
      </div>
    </div>
  )
}

/** The create flow's opening screen (not a wizard step): pick a method, which advances immediately. */
export function DetectorMethodPicker({ onSelect }: { readonly onSelect: (method: DetectorMethod) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex min-w-64 flex-1 basis-80 flex-col gap-1.5">
          <Text.H4M>What's a signal?</Text.H4M>
          <Text.H5 color="foregroundMuted">
            A collection of sessions that share a behavior you care about — frustrated users, failed tool calls, slow
            runs. Latitude checks every incoming session and adds the ones that match.
          </Text.H5>
        </div>
        <SignalFlowDiagram />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <Text.H5>How should Latitude decide what matches?</Text.H5>
          <Text.H6 color="foregroundMuted">You can switch methods later.</Text.H6>
        </div>
        {DETECTOR_METHODS.map((method) => (
          <button
            key={method.id}
            type="button"
            onClick={() => onSelect(method.id)}
            className="group flex w-full cursor-pointer items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/10"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon icon={method.icon} size="default" color="primary" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Text.H5M>{method.title}</Text.H5M>
              <Text.H6 color="foregroundMuted">{method.summary}</Text.H6>
            </div>
            <Icon
              icon={ChevronRightIcon}
              size="sm"
              color="foregroundMuted"
              className="shrink-0 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        ))}
      </div>
    </div>
  )
}
