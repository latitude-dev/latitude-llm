import { useLocalStorage } from "@repo/ui"
import { useMemo } from "react"

import type { TableColumnOption } from "./columns-selector.tsx"

interface TableColumnSettings<ColumnId extends string> {
  readonly columnIds: readonly ColumnId[]
  readonly visibleColumnIds: readonly ColumnId[]
}

function uniqueKnownColumnIds<ColumnId extends string>({
  columnIds,
  knownColumnIds,
}: {
  readonly columnIds: readonly string[] | undefined
  readonly knownColumnIds: ReadonlySet<ColumnId>
}): ColumnId[] {
  const nextColumnIds: ColumnId[] = []
  for (const columnId of columnIds ?? []) {
    if (knownColumnIds.has(columnId as ColumnId) && !nextColumnIds.includes(columnId as ColumnId)) {
      nextColumnIds.push(columnId as ColumnId)
    }
  }
  return nextColumnIds
}

function reconcileColumnSettings<ColumnId extends string>({
  settings,
  columns,
}: {
  readonly settings: TableColumnSettings<ColumnId> | null
  readonly columns: readonly TableColumnOption[]
}): TableColumnSettings<ColumnId> {
  const defaultColumnIds = columns.map((column) => column.id as ColumnId)
  const knownColumnIds = new Set(defaultColumnIds)
  const requiredColumnIds = columns.filter((column) => column.required === true).map((column) => column.id as ColumnId)

  const storedColumnIds = uniqueKnownColumnIds({ columnIds: settings?.columnIds, knownColumnIds })
  const columnIds = [...storedColumnIds, ...defaultColumnIds.filter((columnId) => !storedColumnIds.includes(columnId))]

  const storedVisibleColumnIds = uniqueKnownColumnIds({ columnIds: settings?.visibleColumnIds, knownColumnIds })
  const visibleColumnIds =
    storedVisibleColumnIds.length > 0
      ? [...storedVisibleColumnIds, ...defaultColumnIds.filter((columnId) => !storedColumnIds.includes(columnId))]
      : [...defaultColumnIds]

  const requiredVisibleColumnIds = requiredColumnIds.filter((columnId) => !visibleColumnIds.includes(columnId))
  const nextVisibleColumnIds = [...requiredVisibleColumnIds, ...visibleColumnIds].sort(
    (leftColumnId, rightColumnId) => columnIds.indexOf(leftColumnId) - columnIds.indexOf(rightColumnId),
  )

  return { columnIds, visibleColumnIds: nextVisibleColumnIds }
}

export function useTableColumnSettings<ColumnId extends string>({
  storageKey,
  columns,
}: {
  readonly storageKey: string
  readonly columns: readonly TableColumnOption[]
}) {
  const { value: storedSettings, setValue: setStoredSettings } = useLocalStorage<TableColumnSettings<ColumnId> | null>({
    key: storageKey,
    defaultValue: null,
  })

  const settings = useMemo(
    () => reconcileColumnSettings({ settings: storedSettings, columns }),
    [storedSettings, columns],
  )

  const orderedColumns = useMemo(() => {
    const columnsById = new Map(columns.map((column) => [column.id, column]))
    return settings.columnIds.flatMap((columnId) => {
      const column = columnsById.get(columnId)
      return column ? [column] : []
    })
  }, [columns, settings.columnIds])

  return {
    columns: orderedColumns,
    visibleColumnIds: settings.visibleColumnIds,
    setVisibleColumnIds: (visibleColumnIds: readonly ColumnId[]) => {
      setStoredSettings((previousSettings) => ({
        ...reconcileColumnSettings({ settings: previousSettings, columns }),
        visibleColumnIds,
      }))
    },
    setColumnIds: (columnIds: readonly ColumnId[]) => {
      setStoredSettings((previousSettings) =>
        reconcileColumnSettings({
          settings: {
            ...reconcileColumnSettings({ settings: previousSettings, columns }),
            columnIds,
          },
          columns,
        }),
      )
    },
  }
}
