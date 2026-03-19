import { Button, DetailDrawer, Text, useMountEffect } from "@repo/ui"
import { ArrowDownIcon, ArrowUpIcon, Loader2, Save } from "lucide-react"
import { useRef, useState } from "react"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { RowDetailPanel, type RowDetailPanelSaveRef } from "./row-detail-panel.tsx"

function isInCodeMirrorEditor(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(".cm-editor") !== null
}

export function RowDetailDrawer({
  row,
  onClose,
  onSave,
  saving = false,
  isDraft = false,
  canNavigatePrev = false,
  canNavigateNext = false,
  onNavigatePrev,
  onNavigateNext,
  rowDisplayIndex,
}: {
  readonly row: DatasetRowRecord
  readonly onClose: () => void
  readonly onSave?: (data: { input: string; output: string; metadata: string }) => void
  readonly saving?: boolean
  readonly isDraft?: boolean
  readonly canNavigatePrev?: boolean
  readonly canNavigateNext?: boolean
  readonly onNavigatePrev?: () => void
  readonly onNavigateNext?: () => void
  /** 1-based position in the current table list (`#1`, `#2`, …). Omit when the row is not in the loaded list. */
  readonly rowDisplayIndex?: number
}) {
  const panelSaveRef = useRef<RowDetailPanelSaveRef | null>(null)
  const [saveVisible, setSaveVisible] = useState(false)

  const canNavigatePrevRef = useRef(canNavigatePrev)
  const canNavigateNextRef = useRef(canNavigateNext)
  const onNavigatePrevRef = useRef(onNavigatePrev)
  const onNavigateNextRef = useRef(onNavigateNext)
  canNavigatePrevRef.current = canNavigatePrev
  canNavigateNextRef.current = canNavigateNext
  onNavigatePrevRef.current = onNavigatePrev
  onNavigateNextRef.current = onNavigateNext

  useMountEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isInCodeMirrorEditor(e.target)) return
      if (e.key === "ArrowDown") {
        if (canNavigateNextRef.current && onNavigateNextRef.current) {
          e.preventDefault()
          onNavigateNextRef.current()
        }
      } else if (e.key === "ArrowUp") {
        if (canNavigatePrevRef.current && onNavigatePrevRef.current) {
          e.preventDefault()
          onNavigatePrevRef.current()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  return (
    <DetailDrawer
      storeKey="dataset-row-detail-drawer-width"
      onClose={onClose}
      actions={
        <>
          <Button
            variant="ghost"
            className="w-8 h-8 p-0"
            disabled={!canNavigateNext}
            onClick={onNavigateNext}
            aria-label="Next row"
            type="button"
          >
            <ArrowDownIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            className="w-8 h-8 p-0"
            disabled={!canNavigatePrev}
            onClick={onNavigatePrev}
            aria-label="Previous row"
            type="button"
          >
            <ArrowUpIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
          {rowDisplayIndex !== undefined ? (
            <Text.H6 color="foregroundMuted" className="tabular-nums shrink-0 px-1 min-w-[2.5rem] text-center">
              #{rowDisplayIndex}
            </Text.H6>
          ) : null}
        </>
      }
      rightActions={
        onSave && saveVisible ? (
          <Button onClick={() => panelSaveRef.current?.save()} variant="default" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save row
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col py-8 px-6 overflow-y-auto flex-1">
        <RowDetailPanel
          key={row.rowId}
          row={row}
          saveRef={panelSaveRef}
          isDraft={isDraft}
          onSaveVisibilityChange={setSaveVisible}
          {...(onSave !== undefined ? { onSave } : {})}
        />
      </div>
    </DetailDrawer>
  )
}
