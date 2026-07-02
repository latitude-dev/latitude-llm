import { Button, Text, Textarea } from "@repo/ui"

// Criteria phrased as continuations of the label's "A session matches when…" so the
// scaffold teaches the expected shape: a description of the session, not instructions.
const JUDGE_EXAMPLES: ReadonlyArray<{ readonly label: string; readonly criteria: string }> = [
  {
    label: "Frustrated user",
    criteria:
      "the user grew frustrated — repeating themselves, complaining, or giving up before getting a useful answer.",
  },
  {
    label: "Made-up information",
    criteria: "the assistant stated something factually wrong or invented details it could not actually know.",
  },
  {
    label: "Asked for a human",
    criteria: "the user asked to talk to a real person, or tried to escalate beyond the assistant.",
  },
]

/**
 * The LLM-as-judge tab: the label is a sentence the user completes, so the input reads as a
 * description of what the session contains — the judge's actual contract — rather than
 * instructions to an AI.
 */
export function JudgeDetectorEditor({
  criteria,
  onCriteriaChange,
}: {
  readonly criteria: string
  readonly onCriteriaChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        label="A session matches when…"
        minRows={3}
        value={criteria}
        onChange={(event) => onCriteriaChange(event.target.value)}
        placeholder='"the user grew frustrated — repeating themselves, complaining, or giving up before getting a useful answer."'
      />
      <div className="flex flex-wrap items-center gap-2">
        <Text.H6 color="foregroundMuted">Try an example:</Text.H6>
        {JUDGE_EXAMPLES.map((example) => (
          <Button
            key={example.label}
            variant="outline"
            size="sm"
            title={example.criteria}
            onClick={() => onCriteriaChange(example.criteria)}
          >
            {example.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
