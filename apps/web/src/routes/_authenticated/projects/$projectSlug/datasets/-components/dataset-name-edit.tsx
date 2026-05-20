import { Button, CopyableText, DropdownMenu, Input, Modal, Text, Textarea, useToast } from "@repo/ui"
import { useForm } from "@tanstack/react-form"
import { useNavigate } from "@tanstack/react-router"
import { Loader2, Trash2 } from "lucide-react"
import { useCallback, useState } from "react"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { deleteDatasetFunction, updateDataset } from "../../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../../lib/data/query-client.tsx"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { createFormSubmitHandler, fieldErrorsAsStrings } from "../../../../../../lib/form-server-action.ts"

function DatasetEditModal({
  dataset,
  open,
  onOpenChange,
  onSuccess,
}: {
  dataset: DatasetRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const projectId = dataset.projectId
  const { toast: showToast } = useToast()

  const form = useForm({
    defaultValues: {
      name: dataset.name,
      description: dataset.description ?? "",
    },
    onSubmit: createFormSubmitHandler(
      async (value) => {
        return await updateDataset({
          data: {
            datasetId: dataset.id,
            name: value.name,
            description: value.description.trim() === "" ? null : value.description,
          },
        })
      },
      {
        onSuccess: () => {
          const qc = getQueryClient()
          qc.invalidateQueries({ queryKey: ["datasets", projectId] })
          qc.invalidateQueries({ queryKey: ["dataset", dataset.id] })
          onOpenChange(false)
          onSuccess?.()
          showToast({ description: "Dataset updated" })
        },
        onError: (error) => {
          showToast({ variant: "destructive", description: toUserMessage(error) })
        },
      },
    ),
  })

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          form.reset({ name: dataset.name, description: dataset.description ?? "" })
        }
      }}
      title="Edit dataset"
      description="Update the dataset name and description."
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={form.state.isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void form.handleSubmit()
            }}
            disabled={form.state.isSubmitting}
            isLoading={form.state.isSubmitting}
          >
            Save
          </Button>
        </div>
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
              id="dataset-edit-name"
              label="Name"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void form.handleSubmit()
              }}
              disabled={form.state.isSubmitting}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Textarea
              id="dataset-edit-description"
              label="Description"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              disabled={form.state.isSubmitting}
              minRows={4}
              maxRows={8}
              errors={fieldErrorsAsStrings(field.state.meta.errors)}
            />
          )}
        </form.Field>
      </form>
    </Modal>
  )
}

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
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const openEdit = useCallback(() => {
    setEditOpen(true)
  }, [])

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
        description: toUserMessage(e),
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
          <div className="flex min-w-0 max-w-max shrink-0">
            <CopyableText value={dataset.slug} size="sm" tooltip="Copy dataset slug" />
          </div>
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

      <DatasetEditModal
        dataset={dataset}
        open={editOpen}
        onOpenChange={setEditOpen}
        {...(onSuccess ? { onSuccess } : {})}
      />

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
