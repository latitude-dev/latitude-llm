import type { FilterSet } from "@domain/shared"
import { Button, cn, Icon, RichTextEditor, Skeleton, Text, Textarea, useMountEffect } from "@repo/ui"
import { CheckIcon, Loader2Icon, WandSparklesIcon } from "lucide-react"
import { useRef, useState } from "react"
import { runScriptGeneration } from "../../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

// Stages are elapsed-time estimates — the worker reports no intermediate progress. They mirror
// what it really does (generate, smoke-test in the sandbox, retry on failure) so the wait reads
// as work, and the last stage holds until the poll resolves.
const GENERATION_STAGES: ReadonlyArray<{ readonly atSeconds: number; readonly label: string }> = [
  { atSeconds: 0, label: "Reading your description" },
  { atSeconds: 3, label: "Writing the script" },
  { atSeconds: 14, label: "Running it against a recent session" },
  { atSeconds: 26, label: "Refining the result" },
]

const GENERATION_TIPS: ReadonlyArray<string> = [
  "Scripts can mix hard checks with llm() judgment in a single evaluation.",
  "Scripts see the whole session: conversation, metrics, tool calls, and errors.",
  "You can edit every line of the generated script before saving.",
  "Each run ends by returning Passed() or Failed() for the session.",
]

const SKELETON_WIDTHS: ReadonlyArray<string> = ["w-3/4", "w-1/2", "w-5/6", "w-2/3", "w-1/3", "w-3/5"]

function GenerationProgress() {
  const [elapsed, setElapsed] = useState(0)
  useMountEffect(() => {
    const timer = setInterval(() => setElapsed((previous) => previous + 1), 1000)
    return () => clearInterval(timer)
  })

  const stageIndex = GENERATION_STAGES.filter((stage) => elapsed >= stage.atSeconds).length - 1
  const tip = GENERATION_TIPS[Math.floor(elapsed / 7) % GENERATION_TIPS.length]
  const skeletonLines = Math.min(3 + Math.floor(elapsed / 4), 9)

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4">
      <Text.H6 color="foregroundMuted">Writing and testing your script — usually takes about half a minute.</Text.H6>
      <div className="flex flex-col gap-2">
        {GENERATION_STAGES.map((stage, index) => (
          <div key={stage.label} className="flex items-center gap-2">
            {index < stageIndex ? (
              <Icon icon={CheckIcon} size="sm" color="primary" />
            ) : index === stageIndex ? (
              <Loader2Icon className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="flex h-4 w-4 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
              </span>
            )}
            <Text.H6 color={index > stageIndex ? "foregroundMuted" : "foreground"}>{stage.label}</Text.H6>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-3">
        {Array.from({ length: skeletonLines }, (_, index) => (
          <Skeleton key={index} className={cn("h-2.5", SKELETON_WIDTHS[index % SKELETON_WIDTHS.length])} />
        ))}
      </div>
      <Text.H6 color="foregroundMuted">{tip}</Text.H6>
    </div>
  )
}

/**
 * The Custom script tab, describe-first: the primary flow is a natural-language description that
 * Latitude turns into a raw sandbox script; hand-writing is the secondary path. The script is the
 * source of truth — it lives in the parent so preview and save read it; the describe prompt,
 * reasoning, and generation status are local. Generation runs in a worker (see
 * `runScriptGeneration`) and is cancelled if the modal unmounts mid-run.
 */
export function AdvancedDetectorEditor({
  projectId,
  filters,
  script,
  onScriptChange,
}: {
  readonly projectId: string
  readonly filters: FilterSet | null
  readonly script: string
  readonly onScriptChange: (value: string) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  useMountEffect(() => () => abortRef.current?.abort())

  const hasScript = script.trim().length > 0
  const showEditor = (hasScript || manual) && !generating

  const generate = (): void => {
    const trimmed = prompt.trim()
    if (trimmed.length === 0) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError(null)
    void runScriptGeneration({ projectId, prompt: trimmed, filters, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.status === "done") {
          onScriptChange(result.script)
          setReasoning(result.reasoning)
        } else if (result.status === "error") {
          setError(result.error)
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(toUserMessage(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setGenerating(false)
      })
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        label="This script should check whether…"
        minRows={3}
        value={prompt}
        disabled={generating}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder='"the session took over 30 seconds and the assistant apologized at any point."'
      />

      <div className="flex items-center gap-3">
        <Button onClick={generate} disabled={generating || prompt.trim().length === 0} isLoading={generating}>
          <Icon icon={WandSparklesIcon} size="sm" />
          {hasScript ? "Regenerate script" : "Generate script"}
        </Button>
        {!showEditor && !generating ? (
          <Button variant="link" onClick={() => setManual(true)}>
            Or write it manually
          </Button>
        ) : null}
      </div>

      {generating ? <GenerationProgress /> : null}
      {error ? <Text.H6 color="destructive">{error}</Text.H6> : null}

      {showEditor ? (
        <div className="flex flex-col gap-1.5">
          <Text.H6>Evaluation script</Text.H6>
          <RichTextEditor value={script} onChange={onScriptChange} minHeight="200px" />
        </div>
      ) : null}

      {reasoning && !generating ? (
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">How this works</Text.H6>
          <Text.H6 color="foregroundMuted">{reasoning}</Text.H6>
        </div>
      ) : null}
    </div>
  )
}
