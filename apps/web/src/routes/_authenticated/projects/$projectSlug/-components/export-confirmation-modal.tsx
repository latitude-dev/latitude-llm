import { Button, Icon, Modal } from "@repo/ui"
import { DownloadIcon } from "lucide-react"

interface ExportConfirmationModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly itemLabel: string
  readonly selectedCount: number
  readonly onConfirm: () => void
  readonly exporting: boolean
}

export function ExportConfirmationModal({
  open,
  onOpenChange,
  itemLabel,
  selectedCount,
  onConfirm,
  exporting,
}: ExportConfirmationModalProps) {
  const pluralLabel = selectedCount === 1 ? itemLabel : `${itemLabel}s`
  const formattedCount = selectedCount.toLocaleString()

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Export selected ${pluralLabel}`}
      description={`You are about to export ${formattedCount} ${pluralLabel}. We'll email you a download link when the export is ready.`}
      dismissible
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={exporting} isLoading={exporting}>
            {!exporting && <Icon icon={DownloadIcon} size="sm" />}
            Export {formattedCount} {pluralLabel}
          </Button>
        </div>
      }
    />
  )
}
