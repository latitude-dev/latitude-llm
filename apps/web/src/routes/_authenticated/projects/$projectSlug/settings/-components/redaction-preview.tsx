import type { RedactionSetting } from "@domain/shared"
import type { RedactionPreviewResult } from "@domain/spans"
import { Button, Text, useToast } from "@repo/ui"
import { useState } from "react"
import { previewRedaction } from "../../../../../../domains/projects/projects.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

/**
 * Runs the policy currently on screen against spans already stored, and shows what it would have
 * removed.
 *
 * The only honest answer to "will this eat my tool outputs" before the first enforce: redaction is
 * destructive, applies only going forward, and there is no way to get content back. On demand
 * rather than automatic, because it reads real customer content.
 */
export function RedactionPreview({
  projectId,
  setting,
  disabled = false,
}: {
  readonly projectId: string
  /** The policy as edited, not as saved, so the preview answers for what is about to be applied. */
  readonly setting: RedactionSetting
  readonly disabled?: boolean
}) {
  const { toast } = useToast()
  const [result, setResult] = useState<RedactionPreviewResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const run = async () => {
    setIsRunning(true)
    try {
      setResult(await previewRedaction({ data: { projectId, redaction: setting } }))
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg bg-muted/30 p-5">
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Text.H5M>Check against recent spans</Text.H5M>
          <Text.H6 color="foregroundMuted">
            Runs this policy over spans already stored to show what it would remove. Nothing is changed.
          </Text.H6>
        </div>
        <Button variant="outline" disabled={disabled || isRunning} onClick={() => void run()}>
          {isRunning ? "Checking…" : "Run check"}
        </Button>
      </div>

      {result ? <PreviewResult result={result} /> : null}
    </div>
  )
}

function PreviewResult({ result }: { readonly result: RedactionPreviewResult }) {
  const labels = Object.entries(result.countsByLabel).sort(([, left], [, right]) => right - left)

  if (result.spansSampled === 0) {
    return (
      <Text.H6 color="foregroundMuted">This project has no spans stored yet, so there is nothing to check.</Text.H6>
    )
  }

  return (
    <div className="flex flex-col gap-4 border-border border-t pt-4">
      <Text.H6 color="foregroundMuted">
        Would change {result.spansAffected} of the {result.spansSampled} most recent spans.
      </Text.H6>

      {labels.length > 0 ? (
        <div className="flex flex-row flex-wrap gap-x-4 gap-y-1">
          {labels.map(([label, count]) => (
            <Text.H6 key={label}>
              <span className="font-mono">{label}</span> <span className="text-muted-foreground">{count}</span>
            </Text.H6>
          ))}
        </div>
      ) : null}

      {result.samples.length > 0 ? (
        <div className="flex flex-col gap-3">
          {result.samples.map((sample) => (
            <div key={`${sample.spanId}-${sample.field}`} className="flex flex-col gap-1">
              <Text.H6 color="foregroundMuted">{sample.field}</Text.H6>
              <div className="rounded-md border border-border p-2">
                <Text.H6 color="foregroundMuted">
                  <span className="font-mono line-through">{sample.before}</span>
                </Text.H6>
                <Text.H6>
                  <span className="font-mono">{sample.after}</span>
                </Text.H6>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
