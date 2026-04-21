import { Button, DropdownMenu, Input, Label, Modal, Text, toast } from "@repo/ui"
import { useNavigate } from "@tanstack/react-router"
import { Loader2, Trash2 } from "lucide-react"
import { useCallback, useState } from "react"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { deleteDatasetFunction, updateDataset } from "../../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { parseServerError } from "../../../../../../lib/errors.ts"

export function DatasetNameEdit({
  dataset,
  onSuccess,
  onDownload,
}: {
  dataset: DatasetRecord
  onSuccess?: () => void
  onDownload?: () => void
}) {
  const projectId = dataset.projectId
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editName, setEditName] = useState(dataset.name)
  const [editDescription, setEditDescription] = useState(dataset.description ?? "")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openEdit = useCallback(() => {
    setEditName(dataset.name)
    setEditDescription(dataset.description ?? "")
    setError(null)
    setEditOpen(true)
  }, [dataset.description, dataset.name])

  const saveEdit = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await updateDataset({
        data: {
          datasetId: dataset.id,
          name: editName,
          description: editDescription.trim() === "" ? null : editDescription,
        },
      })
      const qc = getQueryClient()
      qc.invalidateQueries({ queryKey: ["datasets", projectId] })
      qc.invalidateQueries({ queryKey: ["dataset", dataset.id] })
      setEditOpen(false)
      onSuccess?.()
      toast({ description: "Dataset updated" })
    } catch (e) {
      const { _tag, message } = parseServerError(e)
      if (_tag === "DuplicateDatasetNameError" || _tag === "ValidationError") {
        setError(message)
      } else {
        setError(message)
      }
    } finally {
      setSaving(false)
    }
  }, [dataset.id, editDescription, editName, onSuccess, projectId])

  const confirmDelete = useCallback(async () => {
    setDeleting(true)
    try {
      await deleteDatasetFunction({ data: { datasetId: dataset.id } })
      const qc = getQueryClient()
      qc.invalidateQueries({ queryKey: ["datasets", projectId] })
      qc.invalidateQueries({ queryKey: ["dataset", dataset.id] })
      qc.invalidateQueries({ queryKey: ["datasetRows", dataset.id] })
      qc.invalidateQueries({ queryKey: ["datasetRowCount", dataset.id] })
      setDeleteOpen(false)
      toast({ description: "Dataset removed" })
      navigate({ to: "/projects/$projectSlug/datasets", params: { projectId } })
    } catch (e) {
      toast({
        variant: "destructive",
        description: parseServerError(e).message,
      })
    } finally {
      setDeleting(false)
    }
  }, [dataset.id, navigate, projectId])

  return (
    <>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex flex-row items-center gap-2 min-w-0">
          <Text.H3M className="min-w-0 flex-1 truncate">{dataset.name}</Text.H3M>
          <DropdownMenu
            align="end"
            triggerButtonProps={{
              variant: "ghost",
              "aria-label": "Dataset actions",
              className: "shrink-0",
            }}
            options={[
              {
                label: "Edit",
                onClick: openEdit,
              },
              ...(onDownload
                ? [
                    {
                      label: "Export rows",
                      onClick: onDownload,
                    },
                  ]
                : []),
              {
                label: "Remove",
                type: "destructive" as const,
                onClick: () => setDeleteOpen(true),
              },
            ]}
          />
        </div>
        {dataset.description ? (
          <Text.H5 color="foregroundMuted" className="line-clamp-2">
            {dataset.description}
          </Text.H5>
        ) : null}
      </div>

      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit dataset"
        description="Update the dataset name and description."
        dismissible
        footer={
          <div className="flex flex-row items-center gap-2 justify-end">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataset-edit-name">Name</Label>
            <Input
              id="dataset-edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveEdit()
              }}
              disabled={saving}
              aria-invalid={Boolean(error)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dataset-edit-description">Description</Label>
            <textarea
              id="dataset-edit-description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={saving}
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {error ? (
            <div role="alert">
              <Text.H6 color="destructive">{error}</Text.H6>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove dataset"
        description="This will remove the dataset from the project. Row data will no longer be available. This cannot be undone."
        dismissible
        footer={
          <div className="flex flex-row items-center gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove dataset
            </Button>
          </div>
        }
      />
    </>
  )
}
