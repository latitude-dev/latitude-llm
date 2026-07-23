import { MAX_TRACES_PER_DATASET_IMPORT } from "@domain/datasets/constants"
import { Alert, Button, CloseTrigger, Icon, Input, Modal, Select, type SelectOption, Text, useToast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useDatasetsList } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../lib/errors.ts"
import { useRouteProject } from "../-route-data.ts"

/**
 * Generic "add the current selection to a dataset" modal. It owns only the
 * dataset picker / create-new UI and the success plumbing (toast, cache
 * invalidation, navigation); the caller supplies how its selection turns into
 * rows via {@link onAddToExisting} / {@link onCreateNew}, so new row sources
 * (traces, issue traces, cluster sessions, …) need no changes here.
 */
interface AddToDatasetModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Noun shown in the modal copy (e.g. "trace", "session"). */
  itemLabel: string
  selectedCount: number
  description?: string
  onAddToExisting: (datasetId: string) => Promise<{ version: number; rowCount: number }>
  onCreateNew: (name: string) => Promise<{ datasetId: string; version: number; rowCount: number }>
  onSuccess: () => void
}

export function AddToDatasetModal({
  open,
  onOpenChange,
  projectId,
  itemLabel,
  selectedCount,
  description,
  onAddToExisting,
  onCreateNew,
  onSuccess,
}: AddToDatasetModalProps) {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [newDatasetName, setNewDatasetName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const project = useRouteProject()
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

  const itemLabelTitle = `${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)}s`

  const handleSubmit = useCallback(async () => {
    if (selectedCount === 0) return
    setSubmitting(true)
    try {
      if (creatingNew) {
        if (!newDatasetName.trim()) return
        const result = await onCreateNew(newDatasetName.trim())
        toast({
          title: "Dataset created",
          description: `"${newDatasetName.trim()}" created with ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}.`,
        })
        const queryClient = getQueryClient()
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["dataset", result.datasetId] }),
          queryClient.invalidateQueries({ queryKey: ["datasetRows", result.datasetId] }),
        ])
        queryClient.setQueryData(["datasetRowCount", result.datasetId], {
          rows: [],
          total: result.rowCount,
        })
        onSuccess()
        onOpenChange(false)
        navigate({
          to: "/projects/$projectSlug/datasets/$datasetId",
          params: { projectSlug: project.slug, datasetId: result.datasetId },
        })
      } else {
        if (!selectedDatasetId) return
        const result = await onAddToExisting(selectedDatasetId)
        toast({
          title: `${itemLabelTitle} added to dataset`,
          description: `${result.rowCount} row${result.rowCount === 1 ? "" : "s"} added (version ${result.version}).`,
        })
        const queryClient = getQueryClient()
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["datasets", projectId] }),
          queryClient.invalidateQueries({ queryKey: ["datasetRows", selectedDatasetId] }),
          queryClient.invalidateQueries({ queryKey: ["datasetRowCount", selectedDatasetId] }),
        ])
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
    itemLabelTitle,
    onAddToExisting,
    onCreateNew,
    selectedCount,
    toast,
    navigate,
    onSuccess,
    onOpenChange,
    project.slug,
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
      title={`Add ${itemLabel}s to dataset`}
      description={description ?? `${selectedCount} ${itemLabel}${selectedCount === 1 ? "" : "s"} selected`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <CloseTrigger />
          <Button onClick={handleSubmit} disabled={!canSubmit} isLoading={submitting}>
            {!submitting && <Icon icon={Plus} size="sm" />}
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
            description={`You selected ${selectedCount} ${itemLabel}s, but the maximum allowed is ${MAX_TRACES_PER_DATASET_IMPORT.toLocaleString()}. Please narrow your selection.`}
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
              icon: <Icon icon={Plus} size="sm" />,
              onClick: handleCreateNew,
            }}
          />
        )}
      </div>
    </Modal>
  )
}
