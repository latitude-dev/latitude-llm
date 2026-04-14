import { LIVE_QUEUE_DEFAULT_SAMPLING, MAX_TRACES_PER_QUEUE_IMPORT } from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { Alert, Button, CloseTrigger, Icon, Modal, Select, type SelectOption, Tabs, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { QueueForm } from "../../../../../../components/annotation-queues/queue-form.tsx"
import { queueFormValuesToSettings } from "../../../../../../components/annotation-queues/queue-form-schema.ts"
import { addTracesToQueueFunction } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"
import {
  annotationQueuesProjectQueryKey,
  useAnnotationQueuesList,
} from "../../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { useAppForm } from "../../../../../../lib/form-hook-factory.ts"
import type { BulkSelection } from "../../../../../../lib/hooks/useSelectableRows.ts"

type TabId = "existing" | "new"

interface AddToQueueModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectSlug: string
  selection: BulkSelection<string>
  selectedCount: number
  filters?: FilterSet
  onSuccess: () => void
}

export function AddToQueueModal({
  open,
  onOpenChange,
  projectId,
  projectSlug,
  selection,
  selectedCount,
  filters,
  onSuccess,
}: AddToQueueModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("existing")
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: queues } = useAnnotationQueuesList(projectId)
  const portalContainerRef = useRef<HTMLDivElement>(null)

  const form = useAppForm({
    defaultValues: {
      name: "",
      description: "",
      instructions: "",
      assignees: [] as string[],
      isLive: false,
      filters: (filters ?? {}) as FilterSet,
      sampling: LIVE_QUEUE_DEFAULT_SAMPLING,
    },
    validators: {
      onSubmit: ({ value }) => {
        const errors: Record<string, string> = {}
        if (!value.name.trim()) {
          errors.name = "Queue name is required"
        }
        if (!value.description.trim()) {
          errors.description = "Description is required"
        }
        if (!value.instructions.trim()) {
          errors.instructions = "Instructions are required"
        }
        return Object.keys(errors).length > 0 ? { fields: errors } : undefined
      },
    },
  })

  const queueOptions = useMemo<SelectOption<string>[]>(
    () => queues.map((q: AnnotationQueueRecord) => ({ label: q.name, value: q.id })),
    [queues],
  )

  const selectionWithFilters = useMemo(() => {
    if (selection.mode === "all") {
      return { ...selection, filters }
    }
    if (selection.mode === "allExcept") {
      return { ...selection, filters }
    }
    return selection
  }, [selection, filters])

  const handleSubmit = useCallback(async () => {
    if (selectedCount === 0) return

    const isCreatingNew = activeTab === "new"

    if (isCreatingNew) {
      await form.handleSubmit()
      if (!form.state.isValid) return
    } else if (!selectedQueueId) {
      return
    }

    const formValues = form.state.values

    setSubmitting(true)
    try {
      const data = isCreatingNew
        ? {
            projectId,
            newQueue: {
              name: formValues.name.trim(),
              description: formValues.description,
              instructions: formValues.instructions,
              assignees: formValues.assignees,
              settings: queueFormValuesToSettings(formValues),
            },
            selection: selectionWithFilters,
          }
        : { projectId, queueId: selectedQueueId as string, selection: selectionWithFilters }

      const result = await addTracesToQueueFunction({ data })

      toast({
        title: isCreatingNew ? "Queue created" : "Traces queued",
        description: "Traces are being added in the background. Will appear in the queue shortly.",
      })

      getQueryClient().invalidateQueries({ queryKey: annotationQueuesProjectQueryKey(projectId) })
      getQueryClient().invalidateQueries({ queryKey: ["annotation-queue-items", projectId, result.queueId] })

      onSuccess()
      onOpenChange(false)

      if (isCreatingNew) {
        navigate({
          to: "/projects/$projectSlug/annotation-queues/$queueId",
          params: { projectSlug, queueId: result.queueId },
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: toUserMessage(error),
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    activeTab,
    form,
    selectedQueueId,
    projectId,
    projectSlug,
    selectionWithFilters,
    selectedCount,
    toast,
    navigate,
    onSuccess,
    onOpenChange,
  ])

  const exceedsLimit = selectedCount > MAX_TRACES_PER_QUEUE_IMPORT
  const canSubmit = selectedCount > 0 && !submitting && !exceedsLimit && (activeTab === "new" || !!selectedQueueId)

  const tabOptions = useMemo(
    () => [
      { id: "existing" as const, label: "Existing Queue" },
      { id: "new" as const, label: "Create New" },
    ],
    [],
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add traces to annotation queue"
      description={`${selectedCount} trace${selectedCount === 1 ? "" : "s"} selected`}
      size="medium"
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {!submitting && <Icon icon={PlusIcon} size="sm" />}
            {activeTab === "new" ? "Create queue" : "Add to queue"}
          </Button>
        </>
      }
    >
      <div className="relative">
        <div ref={portalContainerRef} className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto" />
        <div className="flex flex-col gap-4">
          {exceedsLimit && (
            <Alert
              variant="destructive"
              title="Selection too large"
              description={`You selected ${selectedCount} traces, but the maximum allowed is ${MAX_TRACES_PER_QUEUE_IMPORT.toLocaleString()}. Please narrow your selection.`}
            />
          )}

          <Tabs options={tabOptions} active={activeTab} onSelect={setActiveTab} variant="bordered" size="sm" />

          <div
            className="grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: activeTab === "existing" ? "1fr 0fr" : "0fr 1fr" }}
          >
            <div className="overflow-hidden">
              <Select<string>
                name="queue"
                label="Annotation Queue"
                placeholder="Select a queue"
                options={queueOptions}
                value={selectedQueueId ?? undefined}
                onChange={setSelectedQueueId}
                searchable
                searchPlaceholder="Search queues..."
                searchableEmptyMessage="No queues found."
                side="bottom"
              />
            </div>
            <div className="overflow-hidden">
              <QueueForm
                form={form}
                projectId={projectId}
                showLiveSettings={true}
                {...(filters ? { initialFilters: filters } : {})}
                portalContainer={portalContainerRef}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
