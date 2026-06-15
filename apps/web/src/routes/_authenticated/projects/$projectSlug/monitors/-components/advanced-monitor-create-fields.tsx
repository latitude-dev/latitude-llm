import { Input, Textarea } from "@repo/ui"
import { AlertCardForm } from "./alert-card-form.tsx"
import type { AlertDraft, AlertFieldErrors } from "./alert-form-helpers.ts"

export interface AdvancedMonitorCreateValue {
  readonly name: string
  readonly description: string
  readonly alert: AlertDraft
  readonly nameError: string | undefined
  readonly alertErrors: AlertFieldErrors
}

export function AdvancedMonitorCreateFields({
  value,
  onChange,
  projectId,
  projectSlug,
}: {
  readonly value: AdvancedMonitorCreateValue
  readonly onChange: (next: AdvancedMonitorCreateValue) => void
  readonly projectId: string
  readonly projectSlug: string
}) {
  const set = (patch: Partial<AdvancedMonitorCreateValue>) => onChange({ ...value, ...patch })

  return (
    <>
      <Input
        required
        label="Name"
        placeholder="Tool error spikes"
        value={value.name}
        onChange={(event) => set({ name: event.target.value, nameError: undefined })}
        {...(value.nameError ? { errors: [value.nameError] } : {})}
      />
      <Textarea
        label="Description"
        placeholder="What is this monitor for?"
        value={value.description}
        onChange={(event) => set({ description: event.target.value })}
        minRows={2}
      />
      <AlertCardForm
        value={value.alert}
        onChange={(alert) => set({ alert, alertErrors: {} })}
        projectId={projectId}
        projectSlug={projectSlug}
        errors={value.alertErrors}
      />
    </>
  )
}
