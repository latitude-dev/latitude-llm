import { Button, DetailDrawer, Text, Tooltip } from "@repo/ui"
import { useHotkey } from "@tanstack/react-hotkeys"
import { ArrowDownIcon, ArrowUpIcon, Loader2, Save } from "lucide-react"
import { useRef, useState } from "react"
import { HotkeyBadge } from "../../../../../../components/hotkey-badge.tsx"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { RowDetailPanel, type RowDetailPanelSaveRef } from "./row-detail-panel.tsx"

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

  useHotkey("Mod+S", () => panelSaveRef.current?.save(), { enabled: saveVisible && !!onSave })

  return (
    <DetailDrawer
      storeKey="dataset-row-detail-drawer-width"
      onClose={onClose}
      actions={
        <>
          <Tooltip
            asChild
            side="bottom"
            trigger={
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
            }
          >
            Next row <HotkeyBadge hotkey="J" />
          </Tooltip>
          <Tooltip
            asChild
            side="bottom"
            trigger={
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
            }
          >
            Previous row <HotkeyBadge hotkey="K" />
          </Tooltip>
          {rowDisplayIndex !== undefined ? (
            <Text.H6 color="foregroundMuted" className="tabular-nums shrink-0 px-1 min-w-10 text-center">
              #{rowDisplayIndex}
            </Text.H6>
          ) : null}
        </>
      }
      rightActions={
        onSave && saveVisible ? (
          <Tooltip
            asChild
            side="bottom"
            trigger={
              <Button onClick={() => panelSaveRef.current?.save()} variant="default" size="sm" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save row
              </Button>
            }
          >
            Save row <HotkeyBadge hotkey="Mod+S" />
          </Tooltip>
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
