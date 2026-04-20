import {
  LIVE_QUEUE_DEFAULT_SAMPLING,
  SYSTEM_QUEUE_DEFAULT_SAMPLING,
  SYSTEM_QUEUE_DEFINITIONS,
} from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { Alert, Button, CloseTrigger, Modal, SwitchInput, useToast } from "@repo/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo, useRef } from "react"
import { QueueForm } from "../../../../../../components/annotation-queues/queue-form.tsx"
import { queueFormValuesToSettings } from "../../../../../../components/annotation-queues/queue-form-schema.ts"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import {
  createAnnotationQueue,
  updateAnnotationQueue,
} from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useAppForm } from "../../../../../../lib/form-hook-factory.ts"
import { createFormSubmitHandler } from "../../../../../../lib/form-server-action.ts"

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

  const systemSamplingRestoreDefault = useMemo(() => {
    if (!queue?.system) return LIVE_QUEUE_DEFAULT_SAMPLING
    const match = SYSTEM_QUEUE_DEFINITIONS.find((d) => d.slug === queue.slug)
    return match?.sampling ?? SYSTEM_QUEUE_DEFAULT_SAMPLING
  }, [queue])

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
      sampling:
        queue?.system === true
          ? (queue.settings.sampling ?? 0)
          : (queue?.settings.sampling ?? LIVE_QUEUE_DEFAULT_SAMPLING),
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        const settings = isSystem ? { sampling: value.sampling } : queueFormValuesToSettings(value)

        if (isEdit) {
          if (isSystem && queue) {
            await updateAnnotationQueue({
              data: {
                projectId,
                queueId: queue.id,
                name: queue.name,
                description: queue.description,
                instructions: queue.instructions,
                assignees: [...queue.assignees],
                settings: { sampling: value.sampling },
              },
            })
          } else {
            await updateAnnotationQueue({
              data: {
                projectId,
                queueId: queue.id,
                name: value.name.trim(),
                description: value.description,
                instructions: value.instructions,
                assignees: value.assignees,
                ...(Object.keys(settings).length > 0 ? { settings } : {}),
              },
            })
          }
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
          await queryClient.invalidateQueries({ queryKey: ["annotation-queues", projectId] })
          await queryClient.invalidateQueries({ queryKey: ["annotation-queues-list", projectId] })
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
      description={
        isSystem
          ? "Turn automated sampling on or off for this system queue."
          : isEdit
            ? "Update queue settings and assignees."
            : "Set up a new queue to organize trace reviews."
      }
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
            <Alert
              variant="default"
              title="System queue"
              description="Latitude manages this queue. You can pause automated sampling so traces are no longer evaluated for it."
            />
            <form.Field name="sampling">
              {(field) => {
                const enabled = field.state.value > 0
                const restoreRate =
                  queue && (queue.settings.sampling ?? 0) > 0
                    ? (queue.settings.sampling ?? 0)
                    : systemSamplingRestoreDefault
                return (
                  <SwitchInput
                    id="system-queue-sampling-enabled"
                    label="Automated sampling"
                    description="When disabled, this queue does not receive new automatically flagged traces. Turn it back on to resume sampling at the default rate for this queue type."
                    checked={enabled}
                    onCheckedChange={(checked) => field.handleChange(checked ? restoreRate : 0)}
                  />
                )
              }}
            </form.Field>
          </div>
        ) : (
          <QueueForm form={form} projectId={projectId} portalContainer={portalContainerRef} />
        )}
      </div>
    </Modal>
  )
}
