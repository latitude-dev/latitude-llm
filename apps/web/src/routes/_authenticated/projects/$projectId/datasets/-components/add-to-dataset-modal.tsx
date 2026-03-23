import { MAX_TRACES_PER_DATASET_IMPORT } from "@domain/datasets/constants"
import { Alert, Button, CloseTrigger, Input, Modal, Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useDatasetsList } from "../../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import {
  addTracesToDatasetMutation,
  createDatasetFromTracesMutation,
} from "../../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import type { BulkSelection } from "../../../../../../lib/hooks/useSelectableRows.ts"

interface AddToDatasetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  selection: BulkSelection<string>
  selectedCount: number
  onSuccess: () => void
}

export function AddToDatasetModal({
  open,
  onOpenChange,
  projectId,
  selection,
  selectedCount,
  onSuccess,
}: AddToDatasetModalProps) {
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
    if (selectedCount === 0) return
    setSubmitting(true)
    try {
      if (creatingNew) {
        if (!newDatasetName.trim()) return
        const result = await createDatasetFromTracesMutation({
          data: { projectId, name: newDatasetName.trim(), selection },
        })
        toast({
          title: "Dataset created",
          description: `"${newDatasetName.trim()}" created with ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`,
        })
        getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
        onSuccess()
        onOpenChange(false)
        navigate({
          to: "/projects/$projectId/datasets/$datasetId",
          params: { projectId, datasetId: result.datasetId },
        })
      } else {
        if (!selectedDatasetId) return
        const result = await addTracesToDatasetMutation({
          data: { projectId, datasetId: selectedDatasetId, selection },
        })
        toast({
          title: "Traces added to dataset",
          description: `${result.rowCount} row${result.rowCount === 1 ? "" : "s"} added (version ${result.version}).`,
        })
        getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
        getQueryClient().invalidateQueries({ queryKey: ["datasetRows", selectedDatasetId] })
        getQueryClient().invalidateQueries({ queryKey: ["datasetRowCount", selectedDatasetId] })
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
    selectedDatasetId,
    newDatasetName,
    projectId,
    selection,
    selectedCount,
    toast,
    navigate,
    onSuccess,
    onOpenChange,
  ])

  const exceedsLimit = selectedCount > MAX_TRACES_PER_DATASET_IMPORT
  const canSubmit =
    selectedCount > 0 &&
    !submitting &&
    !exceedsLimit &&
    (creatingNew ? newDatasetName.trim().length > 0 : !!selectedDatasetId)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add traces to dataset"
      description={`${selectedCount} trace${selectedCount === 1 ? "" : "s"} selected`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <CloseTrigger />
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {!submitting && <Plus className="h-4 w-4" />}
            {creatingNew ? "Create & add" : "Add to dataset"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {exceedsLimit && (
          <Alert
            variant="destructive"
            title="Selection too large"
            description={`You selected ${selectedCount} traces, but the maximum allowed is ${MAX_TRACES_PER_DATASET_IMPORT.toLocaleString()}. Please narrow your selection.`}
          />
        )}
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
