import { LIVE_QUEUE_DEFAULT_SAMPLING } from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { Button, CloseTrigger, Modal, Slider, Text, useToast } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useRef } from "react"
import { QueueForm } from "../../../../../../components/annotation-queues/queue-form.tsx"
import { queueFormValuesToSettings } from "../../../../../../components/annotation-queues/queue-form-schema.ts"
import { UserMultiSelect } from "../../../../../../components/user-multi-select.tsx"
import {
  annotationQueuesProjectQueryKey,
  updateAnnotationQueueMutation,
} from "../../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { createAnnotationQueue } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useAppForm } from "../../../../../../lib/form-hook-factory.ts"
import { createFormSubmitHandler } from "../../../../../../lib/form-server-action.ts"

function SamplingSlider({
  value,
  onChange,
  description,
}: {
  value: number
  onChange: (value: number) => void
  description: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Text.H5>Sampling</Text.H5>
        <Text.H5 color="foregroundMuted">{value}%</Text.H5>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v ?? LIVE_QUEUE_DEFAULT_SAMPLING)}
        min={0}
        max={100}
        step={1}
      />
      <Text.H6 color="foregroundMuted">{description}</Text.H6>
    </div>
  )
}

interface QueueModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly projectId: string
  readonly queue?: AnnotationQueueRecord
  readonly onSuccess: () => void
}

export function QueueModal({ open, onOpenChange, projectId, queue, onSuccess }: QueueModalProps) {
  const isEdit = queue !== undefined
  const isSystem = queue?.system ?? false

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const form = useAppForm({
    defaultValues: {
      name: queue?.name ?? "",
      description: queue?.description ?? "",
      instructions: queue?.instructions ?? "",
      assignees: [...(queue?.assignees ?? [])] as string[],
      isLive: queue?.settings.filter !== undefined,
      filters: (queue?.settings.filter ?? {}) as FilterSet,
      sampling: queue?.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING,
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const settings = isSystem ? { sampling: value.sampling } : queueFormValuesToSettings(value)

        if (isEdit) {
          await updateAnnotationQueueMutation(projectId, queue.id, (draft) => {
            draft.name = value.name.trim()
            draft.description = value.description
            draft.instructions = value.instructions
            draft.assignees = value.assignees
            if (Object.keys(settings).length > 0) {
              draft.settings = { ...draft.settings, ...settings }
            }
            draft.updatedAt = new Date().toISOString()
          })
        } else {
          await createAnnotationQueue({
            data: {
              projectId,
              name: value.name.trim(),
              description: value.description,
              instructions: value.instructions,
              assignees: value.assignees,
              ...(Object.keys(settings).length > 0 ? { settings } : {}),
            },
          })
        }
      },
      {
        onSuccess: async () => {
          toast({
            title: isEdit ? "Queue updated" : "Queue created",
            description: isEdit
              ? "Annotation queue has been updated successfully."
              : "Annotation queue has been created successfully.",
          })
          if (!isEdit) {
            await queryClient.invalidateQueries({ queryKey: annotationQueuesProjectQueryKey(projectId) })
          }
          onSuccess()
          onOpenChange(false)
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: toUserMessage(error),
          })
        },
      },
    ),
  })

  const portalContainerRef = useRef<HTMLDivElement>(null)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Annotation Queue" : "Create Annotation Queue"}
      description={isEdit ? "Update queue settings and assignees." : "Set up a new queue to organize trace reviews."}
      size="medium"
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button
            onClick={() => form.handleSubmit()}
            disabled={form.state.isSubmitting}
            isLoading={form.state.isSubmitting}
          >
            {isEdit ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="relative">
        <div ref={portalContainerRef} className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto" />

        {isSystem ? (
          <div className="flex flex-col gap-6">
            <form.Field name="assignees">
              {(field) => (
                <UserMultiSelect
                  label="Assignees"
                  value={field.state.value}
                  onChange={field.handleChange}
                  placeholder="Select team members..."
                  portalContainer={portalContainerRef}
                />
              )}
            </form.Field>

            <form.Field name="sampling">
              {(field) => (
                <SamplingSlider
                  value={field.state.value}
                  onChange={field.handleChange}
                  description="Percentage of flagged traces to include in this system queue."
                />
              )}
            </form.Field>
          </div>
        ) : (
          <QueueForm form={form} projectId={projectId} portalContainer={portalContainerRef} />
        )}
      </div>
    </Modal>
  )
}
