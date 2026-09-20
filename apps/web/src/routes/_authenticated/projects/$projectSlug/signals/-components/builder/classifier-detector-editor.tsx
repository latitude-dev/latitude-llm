import type { EvaluationSettings } from "@domain/shared"
import { Button, Input, Select, Text, Textarea } from "@repo/ui"

export type ClassifierDraft = Extract<EvaluationSettings, { kind: "classifier" }>

export const EMPTY_CLASSIFIER_DRAFT: ClassifierDraft = {
  kind: "classifier",
  instructions: "",
  options: [
    { label: "Matches", description: "The session contains the behavior." },
    { label: "Does not match", description: "The session does not contain the behavior." },
  ],
  target: "Matches",
}

export function ClassifierDetectorEditor({
  draft,
  onChange,
}: {
  readonly draft: ClassifierDraft
  readonly onChange: (draft: ClassifierDraft) => void
}) {
  const updateOption = (index: number, field: "label" | "description", value: string) => {
    const previous = draft.options[index]
    if (!previous) return
    const options = draft.options.map((option, optionIndex) =>
      optionIndex === index ? { ...option, [field]: value || (field === "description" ? null : "") } : option,
    )
    const target = field === "label" && draft.target === previous.label ? value : draft.target
    onChange({ ...draft, options, target })
  }

  const removeOption = (index: number) => {
    const options = draft.options.filter((_, optionIndex) => optionIndex !== index)
    const target = options.some((option) => option.label === draft.target) ? draft.target : (options[0]?.label ?? "")
    onChange({ ...draft, options, target })
  }

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        label="What should Jev classify?"
        minRows={2}
        value={draft.instructions}
        onChange={(event) => onChange({ ...draft, instructions: event.target.value })}
        placeholder="Which outcome best describes this session?"
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Text.H6B>Options</Text.H6B>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange({ ...draft, options: [...draft.options, { label: "", description: null }] })}
          >
            Add option
          </Button>
        </div>
        {draft.options.map((option, index) => (
          <div key={index} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
              <Input
                label="Name"
                value={option.label}
                onChange={(event) => updateOption(index, "label", event.target.value)}
                placeholder="Escalation"
              />
              <Input
                label="Description"
                value={option.description ?? ""}
                onChange={(event) => updateOption(index, "description", event.target.value)}
                placeholder="The user asks for a human agent."
              />
            </div>
            <Button variant="ghost" size="sm" disabled={draft.options.length <= 2} onClick={() => removeOption(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Select
        name="classifier-target"
        label="Signal match option"
        options={draft.options
          .filter((option) => option.label.trim().length > 0)
          .map((option) => ({ label: option.label, value: option.label }))}
        value={draft.target}
        onChange={(target) => onChange({ ...draft, target })}
      />
      <Text.H6 color="foregroundMuted">
        The probability of this option becomes the signal score. Custom scripts can use every returned probability.
      </Text.H6>
    </div>
  )
}
