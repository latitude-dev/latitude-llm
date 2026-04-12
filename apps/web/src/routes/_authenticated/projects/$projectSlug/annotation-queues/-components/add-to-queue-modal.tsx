import { MAX_TRACES_PER_QUEUE_IMPORT } from "@domain/annotation-queues"
import type { FilterSet } from "@domain/shared"
import { Alert, Button, CloseTrigger, Input, Modal, Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { addTracesToQueueFunction } from "../../../../../../domains/annotation-queue-items/annotation-queue-items.functions.ts"
import { useAnnotationQueuesList } from "../../../../../../domains/annotation-queues/annotation-queues.collection.ts"
import type { AnnotationQueueRecord } from "../../../../../../domains/annotation-queues/annotation-queues.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import type { BulkSelection } from "../../../../../../lib/hooks/useSelectableRows.ts"

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
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newQueueName, setNewQueueName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: queues } = useAnnotationQueuesList(projectId)

  const queueOptions = useMemo<SelectOption<string>[]>(
    () => queues.map((q: AnnotationQueueRecord) => ({ label: q.name, value: q.id })),
    [queues],
  )

  const handleSelectChange = useCallback((value: string) => {
    setSelectedQueueId(value)
    setCreatingNew(false)
  }, [])

  const handleCreateNew = useCallback(() => {
    setCreatingNew(true)
    setSelectedQueueId(null)
  }, [])

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
    setSubmitting(true)
    try {
      if (creatingNew) {
        if (!newQueueName.trim()) return
        const result = await addTracesToQueueFunction({
          data: {
            projectId,
            newQueueName: newQueueName.trim(),
            selection: selectionWithFilters,
          },
        })
        toast({
          title: "Queue created",
          description: `"${newQueueName.trim()}" created with ${result.insertedCount} trace${result.insertedCount === 1 ? "" : "s"}.`,
        })
        getQueryClient().invalidateQueries({ queryKey: ["annotation-queues", projectId] })
        getQueryClient().invalidateQueries({ queryKey: ["annotation-queues-list", projectId] })
        onSuccess()
        onOpenChange(false)
        navigate({
          to: "/projects/$projectSlug/annotation-queues/$queueId",
          params: { projectSlug, queueId: result.queueId },
        })
      } else {
        if (!selectedQueueId) return
        const result = await addTracesToQueueFunction({
          data: { projectId, queueId: selectedQueueId, selection: selectionWithFilters },
        })
        toast({
          title: "Traces added to queue",
          description: `${result.insertedCount} trace${result.insertedCount === 1 ? "" : "s"} added.`,
        })
        getQueryClient().invalidateQueries({ queryKey: ["annotation-queues", projectId] })
        getQueryClient().invalidateQueries({ queryKey: ["annotation-queues-list", projectId] })
        getQueryClient().invalidateQueries({ queryKey: ["annotation-queue-items", projectId, selectedQueueId] })
        onSuccess()
        onOpenChange(false)
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
    creatingNew,
    selectedQueueId,
    newQueueName,
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
  const canSubmit =
    selectedCount > 0 &&
    !submitting &&
    !exceedsLimit &&
    (creatingNew ? newQueueName.trim().length > 0 : !!selectedQueueId)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add traces to annotation queue"
      description={`${selectedCount} trace${selectedCount === 1 ? "" : "s"} selected`}
      dismissible
      footer={
        <>
          <CloseTrigger />
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {!submitting && <Plus className="h-4 w-4" />}
            {creatingNew ? "Create & add" : "Add to queue"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {exceedsLimit && (
          <Alert
            variant="destructive"
            title="Selection too large"
            description={`You selected ${selectedCount} traces, but the maximum allowed is ${MAX_TRACES_PER_QUEUE_IMPORT.toLocaleString()}. Please narrow your selection.`}
          />
        )}
        {creatingNew ? (
          <div className="flex flex-col gap-2">
            <Input
              label="New queue name"
              placeholder="My annotation queue"
              value={newQueueName}
              onChange={(e) => setNewQueueName(e.target.value)}
              autoFocus
            />
            <button type="button" onClick={() => setCreatingNew(false)} className="self-start">
              <Text.H6 color="primary">Back to existing queues</Text.H6>
            </button>
          </div>
        ) : (
          <Select<string>
            name="queue"
            label="Annotation Queue"
            placeholder="Select a queue"
            options={queueOptions}
            value={selectedQueueId ?? undefined}
            onChange={handleSelectChange}
            searchable
            searchPlaceholder="Search queues..."
            searchableEmptyMessage="No queues found."
            side="bottom"
            footerAction={{
              label: "Create new queue",
              icon: <Plus className="h-4 w-4" />,
              onClick: handleCreateNew,
            }}
          />
        )}
      </div>
    </Modal>
  )
}
