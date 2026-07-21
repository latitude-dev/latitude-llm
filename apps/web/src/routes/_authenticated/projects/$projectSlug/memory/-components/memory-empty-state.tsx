import { Button, CodeBlock, cn, Icon, Skeleton, Text } from "@repo/ui"
import { BrainIcon, ExternalLinkIcon } from "lucide-react"
import { getMemoryTelemetryPrompt } from "../../-components/onboarding-integration-snippets.ts"

const MEMORY_DOCS_HREF = "https://docs.latitude.so/telemetry/memory"

export function MemoryUnavailableState() {
  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <div className="max-w-lg flex flex-col items-center gap-6 text-center">
        <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
          <Icon icon={BrainIcon} size="lg" color="foregroundMuted" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Text.H3 centered>Memory isn't available</Text.H3>
          <Text.H5 color="foregroundMuted" centered>
            Memory observability isn't enabled for this project.
          </Text.H5>
        </div>
      </div>
    </div>
  )
}

/**
 * Empty state for a project with no memory captured. Memory is opt-in — no
 * auto-instrumentation emits it — so unlike Tools/Users this is a "you must
 * instrument it" onboarding, not a "wait for data" notice. A skeleton of a
 * populated store (filetree + a record diff) sits behind a compact card whose
 * primary action is a copy-paste coding-agent prompt. Mirrors the layering of
 * `TracesEmptyOnboarding`.
 */
export function MemoryEmptyState() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MemoryPreviewBackdrop />
      {/* Fade the skeleton into the page background top-to-bottom. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background"
      />
      {/* Solid background masked to a center ellipse — grounds the card by
          dissolving the skeleton behind it with no card/modal edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background [-webkit-mask-image:radial-gradient(ellipse_70%_55%_at_50%_50%,black_35%,transparent_72%)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_50%,black_35%,transparent_72%)]"
      />
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-8">
        <MemoryConnectCard />
      </div>
    </div>
  )
}

function MemoryConnectCard() {
  const prompt = getMemoryTelemetryPrompt()
  return (
    <div className="flex w-full max-w-md flex-col items-start gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon icon={BrainIcon} size="lg" color="foregroundMuted" />
      </div>

      <div className="flex flex-col gap-2">
        <Text.H3 weight="medium">Track how your agent's memory evolves</Text.H3>
        <Text.H5 color="foregroundMuted">
          See what your agent reads and writes to its memory. Point your memory operations at Latitude to start tracking
          them.
        </Text.H5>
      </div>

      <div className="flex w-full flex-col gap-1.5">
        <Text.H6 color="foregroundMuted">Ask your coding agent</Text.H6>
        <CodeBlock value={prompt} copyable wrapLines />
      </div>

      <a href={MEMORY_DOCS_HREF} target="_blank" rel="noopener noreferrer">
        <Button variant="outline">
          <Icon size="sm" icon={ExternalLinkIcon} />
          Read the docs
        </Button>
      </a>
    </div>
  )
}

/** Indent + bar width per faux filetree row; one row reads as the selected record. */
const TREE_ROWS: readonly { readonly indent: string; readonly width: string; readonly selected?: boolean }[] = [
  { indent: "pl-2", width: "w-24" },
  { indent: "pl-8", width: "w-20", selected: true },
  { indent: "pl-8", width: "w-28" },
  { indent: "pl-2", width: "w-20" },
  { indent: "pl-8", width: "w-16" },
  { indent: "pl-8", width: "w-24" },
  { indent: "pl-2", width: "w-16" },
  { indent: "pl-8", width: "w-28" },
  { indent: "pl-2", width: "w-24" },
]

/** Kind + bar width per faux unified-diff line. */
const DIFF_ROWS: readonly { readonly kind: "context" | "add" | "remove"; readonly width: string }[] = [
  { kind: "context", width: "w-16" },
  { kind: "remove", width: "w-52" },
  { kind: "add", width: "w-64" },
  { kind: "context", width: "w-40" },
  { kind: "add", width: "w-48" },
  { kind: "context", width: "w-24" },
  { kind: "context", width: "w-56" },
  { kind: "remove", width: "w-36" },
  { kind: "add", width: "w-44" },
  { kind: "context", width: "w-32" },
  { kind: "context", width: "w-48" },
  { kind: "context", width: "w-16" },
]

/** A static (non-pulsing) skeleton bar — this is a decorative preview, not loading. */
function Shape({ className }: { readonly className?: string }) {
  return <Skeleton animate={false} className={className} />
}

/** Non-interactive skeleton of a populated store — the filetree beside a record diff. */
function MemoryPreviewBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-6">
          <Shape className="h-4 w-4 rounded" />
          <Shape className="h-4 w-40" />
          <div className="ml-auto flex items-center gap-1.5">
            <Shape className="h-5 w-5 rounded-full" />
            <Shape className="h-5 w-5 rounded-full" />
            <Shape className="h-5 w-5 rounded-full" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex w-[280px] min-w-[280px] shrink-0 flex-col border-r">
            <div className="flex h-9 shrink-0 items-center border-b px-3">
              <Shape className="h-3 w-20" />
            </div>
            <div className="flex flex-col gap-1 p-2">
              {TREE_ROWS.map((row, i) => (
                <div
                  key={`tree-${i}`}
                  className={cn("flex h-7 items-center gap-2 rounded pr-2", row.indent, row.selected && "bg-accent")}
                >
                  <Shape className="h-3.5 w-3.5 shrink-0 rounded" />
                  <Shape className={cn("h-3", row.width)} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
              <Shape className="h-3.5 w-3.5 rounded" />
              <Shape className="h-3.5 w-28" />
              <Shape className="h-4 w-10 rounded" />
              <Shape className="ml-auto h-3 w-12" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              {DIFF_ROWS.map((row, i) => (
                <div
                  key={`diff-${i}`}
                  className={cn(
                    "flex h-[22px] items-center gap-2 px-1",
                    row.kind === "add" && "bg-success/10",
                    row.kind === "remove" && "bg-destructive/10",
                  )}
                >
                  <Shape className="h-2.5 w-5 shrink-0" />
                  <Shape className="h-2.5 w-5 shrink-0" />
                  <Shape className={cn("ml-1 h-3", row.width)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
