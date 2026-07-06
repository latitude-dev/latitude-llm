import { SIGNAL_GENERATION_PROMPT_MAX_LENGTH } from "@domain/signals"
import { AgentTextarea, Icon, Text } from "@repo/ui"
import { SearchCheckIcon } from "lucide-react"
import styles from "./describe-signal-intro.module.css"

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
          <span
            className={`-left-[1.5px] absolute top-0 h-1 w-1 rounded-full bg-foreground/30 opacity-0 ${styles.inflowPacket}`}
          />
          <span
            style={{ animationDelay: "600ms" }}
            className={`-left-[1.5px] absolute top-0 h-1 w-1 rounded-full bg-foreground/30 opacity-0 ${styles.inflowPacket}`}
          />
        </>
      ) : (
        <span
          className={`-left-[1.5px] absolute top-0 h-1 w-1 rounded-full bg-primary/60 opacity-0 ${styles.outflowPacket}`}
        />
      )}
    </div>
  )
}

/**
 * Abstract three-stage flow: incoming sessions → the evaluation checks each → matches form the
 * signal. Deliberately non-interactive styling — dashed frame, soft fills, no solid borders or
 * shadows — so it cannot be mistaken for the controls below. The motion tells the story:
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
              className={`h-2 w-2 shrink-0 rounded-full bg-foreground/15 ${styles.sessionDot}`}
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
            <span className={`h-2 w-2 shrink-0 rounded-full bg-primary/50 ${styles.joinDot}`} />
          </span>
        </div>
        <Text.H6 color="foregroundMuted">Matches make up the signal</Text.H6>
      </div>
    </div>
  )
}

/**
 * The create flow's opening screen: describe what to track and Latitude's agent builds the whole
 * signal. Presentational — the modal footer owns the Generate/Configure-manually actions and the
 * generation run itself.
 */
export function DescribeSignalIntro({
  prompt,
  onPromptChange,
  generating,
  step,
  error,
}: {
  readonly prompt: string
  readonly onPromptChange: (prompt: string) => void
  readonly generating: boolean
  readonly step: string | null
  readonly error: string | null
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex min-w-64 flex-1 basis-80 flex-col gap-1.5">
          <Text.H4M>What's a signal?</Text.H4M>
          <Text.H5 color="foregroundMuted">
            A collection of sessions that share a behavior you care about: frustrated users, failed tool calls, slow
            runs. Latitude checks every session as it comes in and adds the ones that match.
          </Text.H5>
        </div>
        <SignalFlowDiagram />
      </div>

      <div className="flex min-h-40 flex-1 flex-col gap-3">
        <AgentTextarea
          fill
          label="What do you want to track?"
          maxLength={SIGNAL_GENERATION_PROMPT_MAX_LENGTH}
          value={prompt}
          status={generating ? `${step ?? "Starting up"}…` : null}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder='"Sessions where the ticket-cancellation tool fails and the user gets frustrated."'
        />

        {error !== null && !generating ? <Text.H6 color="destructive">{error}</Text.H6> : null}
      </div>
    </div>
  )
}
