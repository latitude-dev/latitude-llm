import { generateId } from "@domain/shared"
import { Button, CloseTrigger, Input, Modal, Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useDatasetsList } from "../../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import {
  addTracesToDatasetIntentMutation,
  createDatasetFromTracesIntentMutation,
} from "../../../../../../domains/datasets/datasets.mutations.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"

interface AddToDatasetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  traceIds: string[]
  onSuccess: () => void
}

export function AddToDatasetModal({ open, onOpenChange, projectId, traceIds, onSuccess }: AddToDatasetModalProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: datasets } = useDatasetsList(projectId)

  const datasetOptions = useMemo<SelectOption<string>[]>(
    () => datasets.map((ds: DatasetRecord) => ({ label: ds.name, value: ds.id })),
    [datasets],
  )

  const handleSelectChange = useCallback((value: string) => {
    setSelectedDatasetId(value)
    setCreatingNew(false)
  }, [])

  const handleCreateNew = useCallback(() => {
    setCreatingNew(true)
    setSelectedDatasetId(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (traceIds.length === 0) return
    setSubmitting(true)
    try {
      if (creatingNew) {
        if (!newDatasetName.trim()) return
        const datasetId = generateId()
        const transaction = createDatasetFromTracesIntentMutation({
          datasetId,
          projectId,
          name: newDatasetName.trim(),
          traceIds,
        })
        await transaction.isPersisted.promise
        toast({
          title: "Dataset created",
          description: `"${newDatasetName.trim()}" created from selected traces.`,
        })
        onSuccess()
        onOpenChange(false)
        navigate({
          to: "/projects/$projectId/datasets/$datasetId",
          params: { projectId, datasetId },
        })
      } else {
        if (!selectedDatasetId) return
        const transaction = addTracesToDatasetIntentMutation({
          projectId,
          datasetId: selectedDatasetId,
          traceIds,
        })
        await transaction.isPersisted.promise
        toast({
          title: "Traces added to dataset",
          description: `${traceIds.length} selected trace${traceIds.length === 1 ? "" : "s"} processed.`,
        })
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
  }, [creatingNew, selectedDatasetId, newDatasetName, projectId, traceIds, toast, navigate, onSuccess, onOpenChange])

  const canSubmit =
    traceIds.length > 0 && !submitting && (creatingNew ? newDatasetName.trim().length > 0 : !!selectedDatasetId)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add traces to dataset"
      description={`${traceIds.length} trace${traceIds.length === 1 ? "" : "s"} selected`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <CloseTrigger />
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {!submitting && <Plus className="h-4 w-4" />}
            <Text.H5 color="white">{creatingNew ? "Create & add" : "Add to dataset"}</Text.H5>
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {creatingNew ? (
          <div className="flex flex-col gap-2">
            <Input
              label="New dataset name"
              placeholder="My dataset"
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              autoFocus
            />
            <button type="button" onClick={() => setCreatingNew(false)} className="self-start">
              <Text.H6 color="primary">Back to existing datasets</Text.H6>
            </button>
          </div>
        ) : (
          <Select<string>
            name="dataset"
            label="Dataset"
            placeholder="Select a dataset"
            options={datasetOptions}
            value={selectedDatasetId ?? undefined}
            onChange={handleSelectChange}
            searchable
            searchPlaceholder="Search datasets..."
            searchableEmptyMessage="No datasets found."
            side="bottom"
            footerAction={{
              label: "Create new dataset",
              icon: <Plus className="h-4 w-4" />,
              onClick: handleCreateNew,
            }}
          />
        )}
      </div>
    </Modal>
  )
}
