import type { FilterSet } from "@domain/shared"
import { Button, RichTextEditor, Text, Textarea, useMountEffect } from "@repo/ui"
import { useRef, useState } from "react"
import { runScriptGeneration } from "../../../../../../../domains/signals/signals.collection.ts"
import { toUserMessage } from "../../../../../../../lib/errors.ts"

/**
 * The Advanced detector tab: describe an evaluation in natural language and Latitude authors a raw
 * sandbox script (deterministic checks, an LLM judge, or both) that the user can edit. The script is
 * the source of truth — it lives in the parent so preview and save read it; the describe prompt,
 * reasoning, and generation status are local. Generation runs in a worker (see `runScriptGeneration`)
 * and is cancelled if the modal unmounts mid-run.
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
  const showEditor = hasScript || manual

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
      <div className="flex flex-col gap-1.5">
        <Textarea
          label="Describe the evaluation"
          minRows={3}
          value={prompt}
          disabled={generating}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={'e.g. "Sessions that took over 30s and where the assistant apologized to the user."'}
        />
        <Text.H6 color="foregroundMuted">
          Latitude writes an evaluation script — deterministic checks, an LLM judge, or both — that you can edit below.
        </Text.H6>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={generate} disabled={generating || prompt.trim().length === 0} isLoading={generating}>
          {hasScript ? "Regenerate" : "Generate script"}
        </Button>
        {!showEditor && !generating ? (
          <Button variant="link" onClick={() => setManual(true)}>
            Or write it manually
          </Button>
        ) : null}
      </div>

      {generating ? (
        <Text.H6 color="foregroundMuted">Writing and testing your script against recent sessions…</Text.H6>
      ) : null}
      {error ? <Text.H6 color="destructive">{error}</Text.H6> : null}

      {showEditor ? (
        <div className="flex flex-col gap-1.5">
          <Text.H6>Evaluation script</Text.H6>
          <RichTextEditor value={script} onChange={onScriptChange} minHeight="200px" />
        </div>
      ) : null}

      {reasoning ? (
        <div className="flex flex-col gap-1">
          <Text.H6 color="foregroundMuted">How this works</Text.H6>
          <Text.H6 color="foregroundMuted">{reasoning}</Text.H6>
        </div>
      ) : null}
    </div>
  )
}
