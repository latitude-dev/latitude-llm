import { Button, Modal, Text } from "@repo/ui"
import { Loader2, Trash2 } from "lucide-react"

interface DeleteRowsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedCount: number
  onConfirm: () => void
  deleting: boolean
}

export function DeleteRowsModal({ open, onOpenChange, selectedCount, onConfirm, deleting }: DeleteRowsModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Delete selected rows"
      description={`You are about to delete ${selectedCount} row${selectedCount === 1 ? "" : "s"}. This will create a new dataset version.`}
      dismissible
      footer={
        <div className="flex flex-row items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            <Text.H5>Cancel</Text.H5>
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            <Text.H5 color="white">
              Delete {selectedCount} row{selectedCount === 1 ? "" : "s"}
            </Text.H5>
          </Button>
        </div>
      }
    />
  )
}
