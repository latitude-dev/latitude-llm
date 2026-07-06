import { useHotkeys } from "@tanstack/react-hotkeys"

export function useListRowKeyboardNav<T extends string>({
  rowIds,
  focusedRowId,
  onFocusedRowChange,
  onOpenRow,
  enabled = true,
}: {
  readonly rowIds: readonly T[]
  readonly focusedRowId: T | undefined
  readonly onFocusedRowChange: (rowId: T | undefined) => void
  readonly onOpenRow: (rowId: T) => void
  readonly enabled?: boolean
}) {
  useHotkeys([
    {
      hotkey: "J",
      callback: () => {
        const idx = focusedRowId ? rowIds.indexOf(focusedRowId) : -1
        const nextId = rowIds[idx + 1]
        if (nextId) onFocusedRowChange(nextId)
        else if (rowIds.length > 0 && !focusedRowId) onFocusedRowChange(rowIds[0]!)
      },
      options: { enabled: enabled && rowIds.length > 0, ignoreInputs: true },
    },
    {
      hotkey: "K",
      callback: () => {
        const idx = focusedRowId ? rowIds.indexOf(focusedRowId) : rowIds.length
        const prevId = rowIds[idx - 1]
        if (prevId) onFocusedRowChange(prevId)
      },
      options: { enabled: enabled && rowIds.length > 0, ignoreInputs: true },
    },
    {
      hotkey: "Enter",
      callback: () => {
        if (focusedRowId) onOpenRow(focusedRowId)
      },
      options: { enabled: enabled && focusedRowId != null, ignoreInputs: true },
    },
  ])
}
