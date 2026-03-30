import { Button, Modal, Text } from "@repo/ui"
import { Loader2, Trash2 } from "lucide-react"

interface DeleteRowsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  isAllSelected: boolean
  onConfirm: () => void
  deleting: boolean
}

export function DeleteRowsModal({
  open,
  onOpenChange,
  selectedCount,
  isAllSelected,
  onConfirm,
  deleting,
}: DeleteRowsModalProps) {
  const title = isAllSelected ? "Delete all rows" : "Delete selected rows"
  const description = isAllSelected
    ? "You are about to delete all rows in this dataset."
    : `You are about to delete ${selectedCount} row${selectedCount === 1 ? "" : "s"}.`
  const buttonLabel = isAllSelected ? "Delete all rows" : `Delete ${selectedCount} row${selectedCount === 1 ? "" : "s"}`

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <Text.H5 color="white">{buttonLabel}</Text.H5>
          </Button>
        </div>
      }
    />
  )
}
