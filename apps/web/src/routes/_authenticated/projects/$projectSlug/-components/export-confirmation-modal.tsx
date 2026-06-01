import { Button, Icon, Modal } from "@repo/ui"
import { DownloadIcon } from "lucide-react"

interface ExportConfirmationModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly itemLabel: string
  readonly selectedCount: number
  readonly onConfirm: () => void
  readonly exporting: boolean
  /**
   * `"email"` (default) — the export is large enough to be queued and emailed.
   * `"direct"` — the export will be generated synchronously and downloaded by the browser.
   */
  readonly mode?: "direct" | "email"
}

export function ExportConfirmationModal({
  open,
  onOpenChange,
  itemLabel,
  selectedCount,
  onConfirm,
  exporting,
  mode = "email",
}: ExportConfirmationModalProps) {
  const pluralLabel = selectedCount === 1 ? itemLabel : `${itemLabel}s`
  const formattedCount = selectedCount.toLocaleString()
  const title = mode === "direct" ? `Download selected ${pluralLabel}` : `Export selected ${pluralLabel}`
  const description =
    mode === "direct"
      ? `You are about to download ${formattedCount} ${pluralLabel} as a CSV file.`
      : `You are about to export ${formattedCount} ${pluralLabel}. We'll email you a download link when the export is ready.`
  const confirmLabel =
    mode === "direct" ? `Download ${formattedCount} ${pluralLabel}` : `Export ${formattedCount} ${pluralLabel}`

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={exporting} isLoading={exporting}>
            {!exporting && <Icon icon={DownloadIcon} size="sm" />}
            {confirmLabel}
          </Button>
        </div>
      }
    />
  )
}
