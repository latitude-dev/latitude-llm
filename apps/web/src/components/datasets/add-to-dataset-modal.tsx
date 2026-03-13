import { Button, CloseTrigger, Input, Modal, Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useDatasetsCollection } from "../../domains/datasets/datasets.collection.ts"
import {
  addTracesToDatasetMutation,
  createDatasetFromTracesMutation,
} from "../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../lib/data/query-client.tsx"

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
  const { data: datasets } = useDatasetsCollection(projectId)

  const datasetOptions = useMemo<SelectOption<string>[]>(
    () => (datasets ?? []).map((ds) => ({ label: ds.name, value: ds.id })),
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
        const result = await createDatasetFromTracesMutation({
          data: { projectId, name: newDatasetName.trim(), traceIds },
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
          data: { projectId, datasetId: selectedDatasetId, traceIds },
        })
        toast({
          title: "Traces added to dataset",
          description: `${result.rowCount} row${result.rowCount === 1 ? "" : "s"} added (version ${result.version}).`,
        })
        getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
        getQueryClient().invalidateQueries({ queryKey: ["datasetRows", selectedDatasetId] })
        onSuccess()
        onOpenChange(false)
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add traces to dataset.",
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
