import { Button, CodeBlock, cn, Icon, Skeleton, Text } from "@repo/ui"
import { BrainIcon, ExternalLinkIcon } from "lucide-react"
import { getMemoryTelemetryPrompt } from "../../-components/onboarding-integration-snippets.ts"

const MEMORY_DOCS_HREF = "https://docs.latitude.so/telemetry/memory"

export function MemoryEmptyState() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MemoryPreviewBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background"
      />
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

      <Button asChild variant="outline">
        <a href={MEMORY_DOCS_HREF} target="_blank" rel="noopener noreferrer">
          <Icon size="sm" icon={ExternalLinkIcon} />
          Read the docs
        </a>
      </Button>
    </div>
  )
}

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

function Shape({ className }: { readonly className?: string }) {
  return <Skeleton animate={false} className={className} />
}

function MemoryPreviewBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2.5">
            <Shape className="h-4 w-4 rounded" />
            <Shape className="h-4 w-40" />
          </div>
          <div className="flex items-center gap-1.5">
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
                  className={cn("flex h-7 items-center gap-2 rounded pr-2", row.indent, { "bg-accent": row.selected })}
                >
                  <Shape className="h-3.5 w-3.5 shrink-0 rounded" />
                  <Shape className={cn("h-3", row.width)} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <Shape className="h-3.5 w-3.5 rounded" />
                <Shape className="h-3.5 w-28" />
                <Shape className="h-4 w-10 rounded" />
              </div>
              <Shape className="h-3 w-12" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-3">
              {DIFF_ROWS.map((row, i) => (
                <div
                  key={`diff-${i}`}
                  className={cn("flex h-[22px] items-center gap-2 px-1", {
                    "bg-success/10": row.kind === "add",
                    "bg-destructive/10": row.kind === "remove",
                  })}
                >
                  <Shape className="h-2.5 w-5 shrink-0" />
                  <Shape className="h-2.5 w-5 shrink-0" />
                  <Shape className={cn("h-3", row.width)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
