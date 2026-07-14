import { Button, CloseTrigger, cn, Icon, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
  type ExperimentRecord,
  useCreateExperiment,
  useDeleteExperiment,
  useUpdateExperiment,
} from "../../../../../../domains/experiments/experiments.collection.ts"
import {
  buildPresetVariants,
  EXPERIMENT_PRESET_OPTIONS,
  type ExperimentPreset,
} from "../../../../../../domains/experiments/experiments.presets.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

/** Create an experiment (name + description), then redirect to its detail page to add variants. */
export function ExperimentCreateModal({
  projectId,
  projectSlug,
  onClose,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly onClose: () => void
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const create = useCreateExperiment(projectId)
  const [preset, setPreset] = useState<ExperimentPreset>("custom")

  const form = useForm({
    defaultValues: { name: "", description: "" },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const name = value.name.trim()
        const variants = buildPresetVariants(preset, name, new Date())
        return create.mutateAsync({
          name,
          description: value.description.trim(),
          ...(variants ? { variants } : {}),
        })
      },
      {
        onSuccess: (experiment: ExperimentRecord) => {
          onClose()
          void navigate({
            to: "/projects/$projectSlug/experiments/$experimentSlug",
            params: { projectSlug, experimentSlug: experiment.slug },
          })
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="New experiment"
      description="Experiments compare sessions, users, tools, signals, and behaviours across variants of filters, search queries and time ranges."
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" isLoading={create.isPending} onClick={() => void form.handleSubmit()}>
            Create
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              required
              autoFocus
              label="Name"
              placeholder="English vs. other languages"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Textarea
              label="Description"
              placeholder="Comparing user sessions from English vs. all other languages"
              minRows={2}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <div className="flex flex-col gap-2">
          <Text.H5M>Preset</Text.H5M>
          <div className="grid grid-cols-2 gap-2">
            {EXPERIMENT_PRESET_OPTIONS.map((option) => {
              const active = option.value === preset
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-left transition-colors",
                    active ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                  onClick={() => setPreset(option.value)}
                >
                  <Icon
                    icon={option.icon}
                    size="sm"
                    color={active ? "primary" : "foregroundMuted"}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Text.H5M>{option.label}</Text.H5M>
                    <Text.H6 color="foregroundMuted">{option.description}</Text.H6>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </form>
    </Modal>
  )
}

/** Rename / re-describe an experiment. */
export function ExperimentRenameModal({
  projectId,
  experiment,
  onClose,
  onRenamed,
}: {
  readonly projectId: string
  readonly experiment: ExperimentRecord
  readonly onClose: () => void
  /** Fired with the updated experiment after a successful save. A rename changes the slug, so the detail page uses this to re-point its URL. */
  readonly onRenamed?: (experiment: ExperimentRecord) => void
}) {
  const { toast } = useToast()
  const update = useUpdateExperiment(projectId)

  const form = useForm({
    defaultValues: { name: experiment.name, description: experiment.description },
    onSubmit: createFormSubmitHandler(
      async (value) =>
        update.mutateAsync({
          experimentId: experiment.id,
          name: value.name.trim(),
          description: value.description.trim(),
        }),
      {
        onSuccess: (updated: ExperimentRecord) => {
          toast({ description: "Experiment updated." })
          onClose()
          onRenamed?.(updated)
        },
        onError: (error) => toast({ variant: "destructive", description: toUserMessage(error) }),
      },
    ),
  })

  return (
    <Modal
      open
      dismissible
      onOpenChange={(next) => (!next ? onClose() : undefined)}
      title="Edit experiment"
      description="Rename the experiment or change its description."
      footer={
        <>
          <CloseTrigger />
          <Button type="submit" isLoading={update.isPending} onClick={() => void form.handleSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Input
              required
              autoFocus
              label="Name"
              placeholder="English vs. other languages"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Textarea
              label="Description"
              placeholder="Comparing user sessions from English vs. all other languages"
              minRows={2}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      </form>
    </Modal>
  )
}

/** Confirm removing an experiment. Open when `experiment` is non-null. */
export function ExperimentDeleteConfirmModal({
  projectId,
  experiment,
  onOpenChange,
  onDeleted,
}: {
  readonly projectId: string
  readonly experiment: ExperimentRecord | null
  readonly onOpenChange: (experiment: ExperimentRecord | null) => void
  readonly onDeleted?: (experimentId: string) => void
}) {
  const { toast } = useToast()
  const remove = useDeleteExperiment(projectId)
  const [isPending, setIsPending] = useState(false)

  const onConfirm = async () => {
    if (!experiment) return
    setIsPending(true)
    try {
      await remove.mutateAsync(experiment.id)
      toast({ description: "Experiment removed." })
      onDeleted?.(experiment.id)
      onOpenChange(null)
    } catch (error) {
      toast({ variant: "destructive", description: toUserMessage(error) })
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal
      open={experiment !== null}
      dismissible
      onOpenChange={(open) => (!open ? onOpenChange(null) : undefined)}
      title="Remove experiment"
      description="Removing this experiment cannot be undone."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={isPending} onClick={() => onOpenChange(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isPending} isLoading={isPending} onClick={() => void onConfirm()}>
            Remove
          </Button>
        </div>
      }
    />
  )
}
