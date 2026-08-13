import { Button, Icon, Input, Modal, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { Loader2Icon } from "lucide-react"
import { type ReactNode, useState } from "react"
import type { CustomBehaviorRecord } from "../../../../../../domains/taxonomy/custom-behaviors.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

/** The three author-supplied fields, shared by "New behavior" and "Refine behavior". */
export interface BehaviorDraft {
  readonly name: string
  readonly description: string
  readonly instructions: string
}

export const EMPTY_BEHAVIOR_DRAFT: BehaviorDraft = { name: "", description: "", instructions: "" }

// Models the quality of a built-in preset so users aim for a real instruction,
// not a keyword.
export const BEHAVIOR_INSTRUCTIONS_PLACEHOLDER =
  "e.g. Identify the main reason the user reached out: the underlying goal, not the surface request. State it as a single short phrase in the user's own terms, and treat it as unclear if the conversation doesn't make it obvious."

/**
 * Writing a behavior: the three fields plus the modal around them, shared by "New
 * behavior" (blank or forked from a preset) and "Refine behavior". Validation is the
 * server's — `createAuthoredBehaviorFn` and `refineBehaviorFn` validate these same
 * fields with `newFacetInputSchema` under matching paths, and
 * `createFormSubmitHandler` maps a rejection back onto the field that caused it, so
 * nothing is validated twice.
 *
 * Mount it with a `key` per draft: defaults are read once, so a fresh draft needs a
 * fresh instance.
 */
export function BehaviorAuthoringModal({
  title,
  description,
  alert,
  submitLabel,
  initialDraft,
  action,
  onSuccess,
  onClose,
  onBack,
}: {
  readonly title: string
  readonly description: string
  readonly alert: ReactNode
  readonly submitLabel: string
  readonly initialDraft: BehaviorDraft
  readonly action: (draft: BehaviorDraft) => Promise<CustomBehaviorRecord>
  readonly onSuccess: (result: CustomBehaviorRecord) => void | Promise<void>
  readonly onClose: () => void
  readonly onBack?: () => void
}) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm({
    defaultValues: initialDraft,
    onSubmit: createFormSubmitHandler(
      async (value: BehaviorDraft) => {
        setIsSaving(true)
        try {
          return await action(value)
        } finally {
          setIsSaving(false)
        }
      },
      {
        onSuccess,
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
        resetOnSuccess: false,
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      scrollable
      size="large"
      onOpenChange={(next) => (next || isSaving ? undefined : onClose())}
      title={title}
      description={description}
      footer={
        <div className="flex w-full flex-row justify-between gap-2">
          <Button variant="outline" onClick={onBack ?? onClose} disabled={isSaving}>
            {onBack ? "Back" : "Cancel"}
          </Button>
          <Button onClick={() => void form.handleSubmit()} disabled={isSaving}>
            {isSaving ? <Icon icon={Loader2Icon} size="sm" className="animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {alert}
        <form.Field name="name">
          {(field) => (
            <Input
              autoFocus
              required
              label="Behavior name"
              placeholder="e.g. Payment method"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Textarea
              required
              label="Description"
              description="A short blurb shown in the behavior picker."
              placeholder="e.g. Cluster sessions by the payment method the user asked about."
              minRows={3}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="instructions">
          {(field) => (
            <Textarea
              required
              label="What should we extract from each conversation?"
              description="Write one clear instruction, like the built-in presets: name exactly what to extract, how to phrase it, and when to treat the answer as unclear. Write-once. To change what this behavior means, create a new one."
              placeholder={BEHAVIOR_INSTRUCTIONS_PLACEHOLDER}
              minRows={6}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      </div>
    </Modal>
  )
}
