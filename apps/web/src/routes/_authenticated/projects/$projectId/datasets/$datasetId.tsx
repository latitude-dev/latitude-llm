import { parseDatasetCsv } from "@domain/datasets"
import {
  Button,
  Container,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableSorting,
  Input,
  Skeleton,
  type SortDirection,
  Text,
  toast,
} from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CirclePlus, Download, FileDownIcon, Trash2 } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useDatasetRowsInfiniteScroll } from "../../../../../domains/datasets/datasets.collection.ts"
import {
  type DatasetRecord,
  type DatasetRowRecord,
  deleteDatasetRows,
  getDatasetDownload,
  getDatasetQuery,
  getRowQuery,
  insertDatasetRow,
  listRowsQuery,
  saveDatasetCsv,
  updateDatasetRow,
} from "../../../../../domains/datasets/datasets.functions.ts"
import { ListingLayout as Layout } from "../../../../../layouts/ListingLayout/index.tsx"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { useParamState } from "../../../../../lib/hooks/useParamState.ts"
import { type BulkSelection, useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"
import { CsvImportView, type ParsedCsv } from "./-components/csv-import-view.tsx"
import { createDraftRowRecord, isDatasetDraftRowId } from "./-components/dataset-draft-row.ts"
import { DatasetNameEdit } from "./-components/dataset-name-edit.tsx"
import { DeleteRowsModal } from "./-components/delete-rows-modal.tsx"
import { RowDetailDrawer } from "./-components/row-detail-drawer.tsx"
import { UploadBlankSlate } from "./-components/upload-blank-slate.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/$datasetId")({
  component: DatasetDetailPage,
})

const DEFAULT_ROW_SORTING: InfiniteTableSorting = {
  column: "createdAt",
  direction: "desc",
}

function formatCellValue(data: string | Record<string, unknown>): string {
  if (typeof data === "string") return data
  return JSON.stringify(data)
}

const rowColumns: InfiniteTableColumn<DatasetRowRecord>[] = [
  {
    key: "rowIndex",
    header: "#",
    align: "end",
    minWidth: 52,
    resizable: false,
    render: (_, rowIndex) => `#${rowIndex + 1}`,
  },
  {
    key: "createdAt",
    header: "Created",
    sortKey: "createdAt",
    render: (r) => relativeTime(r.createdAt),
  },
  {
    key: "input",
    header: "Input",
    render: (r) => <Text.Mono>{formatCellValue(r.input)}</Text.Mono>,
  },
  {
    key: "output",
    header: "Output",
    render: (r) => <Text.Mono>{formatCellValue(r.output)}</Text.Mono>,
  },
]

function DatasetDetailPage() {
  const { projectId, datasetId } = Route.useParams()
  const [, setRid] = useParamState("rid", "")

  const { data: dataset, isLoading } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => getDatasetQuery({ data: { datasetId } }),
  })

  const needsRowCountProbe = Boolean(dataset && dataset.currentVersion > 0)
  const { data: rowCountProbe, isLoading: rowCountLoading } = useQuery({
    queryKey: ["datasetRowCount", datasetId],
    queryFn: () =>
      listRowsQuery({
        data: {
          datasetId,
          limit: 1,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      }),
    enabled: needsRowCountProbe,
  })

  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null)

  const handleInsertFirstRow = useCallback(
    async (data: { input: string; output: string; metadata: string }) => {
      try {
        const result = await insertDatasetRow({
          data: {
            datasetId,
            input: data.input,
            output: data.output,
            metadata: data.metadata,
          },
        })
        const qc = getQueryClient()
        await qc.invalidateQueries({ queryKey: ["dataset", datasetId] })
        await qc.invalidateQueries({ queryKey: ["datasets", projectId] })
        await qc.invalidateQueries({ queryKey: ["datasetRows", datasetId] })
        await qc.invalidateQueries({
          queryKey: ["datasetRowCount", datasetId],
        })
        setRid(result.rowId)
      } catch (e) {
        toast({
          variant: "destructive",
          description: e instanceof Error ? e.message : "Failed to add row",
        })
        throw e
      }
    },
    [datasetId, projectId, setRid],
  )

  if (isLoading) {
    return (
      <Container>
        <div className="flex flex-col gap-4 pt-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Container>
    )
  }

  if (!dataset) {
    return (
      <Container>
        <div className="flex items-center justify-center pt-20">
          <Text.H5 color="foregroundMuted">Dataset not found</Text.H5>
        </div>
      </Container>
    )
  }

  const hasRows =
    dataset.currentVersion === 0
      ? false
      : rowCountLoading
        ? true
        : (rowCountProbe?.total ?? rowCountProbe?.rows?.length ?? 0) > 0

  if (hasRows && !parsedCsv) {
    return <DatasetRowsView projectId={projectId} datasetId={datasetId} dataset={dataset} onImport={setParsedCsv} />
  }

  if (parsedCsv) {
    return (
      <CsvMappingView
        projectId={projectId}
        datasetId={datasetId}
        dataset={dataset}
        parsedCsv={parsedCsv}
        onCancel={() => setParsedCsv(null)}
      />
    )
  }

  return <UploadBlankSlate dataset={dataset} onParsed={setParsedCsv} onInsertFirstRow={handleInsertFirstRow} />
}

function CsvMappingView({
  projectId,
  datasetId,
  dataset,
  parsedCsv,
  onCancel,
}: {
  projectId: string
  datasetId: string
  dataset: DatasetRecord
  parsedCsv: ParsedCsv
  onCancel: () => void
}) {
  const handleSave = useCallback(
    async ({
      file,
      mapping,
      options,
    }: {
      file: File
      mapping: { input: string[]; output: string[]; metadata: string[] }
      options: { flattenSingleColumn: boolean; autoParseJson: boolean }
    }) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append(
        "data",
        JSON.stringify({
          datasetId,
          projectId,
          mapping,
          options,
        }),
      )
      await saveDatasetCsv({ data: formData })

      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId],
      })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRowCount", datasetId],
      })
      onCancel()
    },
    [datasetId, projectId, onCancel],
  )

  return (
    <Container size="full">
      <CsvImportView
        title={dataset.name}
        subtitle={parsedCsv.file.name}
        parsedCsv={parsedCsv}
        onCancel={onCancel}
        onSave={handleSave}
      />
    </Container>
  )
}

function DatasetRowsView({
  projectId,
  datasetId,
  dataset,
  onImport,
}: {
  projectId: string
  datasetId: string
  dataset: DatasetRecord
  onImport: (csv: ParsedCsv) => void
}) {
  const [rid, setRid] = useParamState("rid", "")
  const [q, setQ] = useParamState("q", "")
  const [sortBy, setSortBy] = useParamState("sortBy", DEFAULT_ROW_SORTING.column)
  const [sortDirection, setSortDirection] = useParamState("sortDirection", DEFAULT_ROW_SORTING.direction, {
    validate: (v): v is SortDirection => v === "asc" || v === "desc",
  })

  const listQuery = q.trim() || undefined
  const sorting: InfiniteTableSorting = { column: sortBy, direction: sortDirection }
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [draftRow, setDraftRow] = useState<DatasetRowRecord | null>(null)

  const {
    data: rows,
    isLoading,
    infiniteScroll,
    total: serverTotalRows,
  } = useDatasetRowsInfiniteScroll({
    datasetId,
    ...(listQuery ? { search: listQuery } : {}),
    sorting,
  })

  const displayRows = useMemo(() => {
    if (!draftRow) return rows
    if (rows.some((r) => r.rowId === draftRow.rowId)) return rows
    return [draftRow, ...rows]
  }, [rows, draftRow])

  const rowIds = useMemo(() => displayRows.map((r) => r.rowId), [displayRows])
  const totalRowCount = serverTotalRows ?? displayRows.length
  const selection = useSelectableRows({
    rowIds,
    totalRowCount,
  })

  const selectedRowFromList = useMemo(
    () => (rid ? (displayRows.find((r) => r.rowId === rid) ?? null) : null),
    [rid, displayRows],
  )

  useLayoutEffect(() => {
    if (rid && isDatasetDraftRowId(rid) && draftRow?.rowId !== rid) {
      setRid("")
    }
  }, [rid, draftRow, setRid])

  const { data: selectedRowFromQuery } = useQuery({
    queryKey: ["datasetRow", datasetId, rid],
    queryFn: () => getRowQuery({ data: { datasetId, rowId: rid } }),
    enabled: Boolean(rid && !selectedRowFromList),
  })

  const selectedRow = selectedRowFromList ?? selectedRowFromQuery ?? null

  const importFileRef = useRef<HTMLInputElement>(null)

  const openRow = (row: DatasetRowRecord) => {
    if (!isDatasetDraftRowId(row.rowId)) {
      setDraftRow(null)
    }
    setRid(row.rowId)
  }

  const rowNavIndex = useMemo(() => (rid ? displayRows.findIndex((r) => r.rowId === rid) : -1), [rid, displayRows])
  const canNavigatePrev = rowNavIndex > 0
  const canNavigateNext = rowNavIndex >= 0 && rowNavIndex < displayRows.length - 1

  const navigateAdjacentRow = useCallback(
    (delta: 1 | -1) => {
      if (!rid) return
      const idx = displayRows.findIndex((r) => r.rowId === rid)
      if (idx < 0) return
      const target = displayRows[idx + delta]
      if (target) openRow(target)
    },
    [rid, displayRows, openRow],
  )

  const handleAddRow = () => {
    const draft = createDraftRowRecord(datasetId)
    setDraftRow(draft)
    setRid(draft.rowId)
  }

  const closeRow = () => {
    if (rid && isDatasetDraftRowId(rid)) {
      setDraftRow(null)
    }
    setRid("")
  }

  const handleSortChange = (next: InfiniteTableSorting) => {
    setSortBy(next.column)
    setSortDirection(next.direction)
  }

  const handleSaveRow = useCallback(
    async (data: { input: string; output: string; metadata: string }) => {
      if (!rid) return
      setSaving(true)
      try {
        if (isDatasetDraftRowId(rid)) {
          const result = await insertDatasetRow({
            data: {
              datasetId,
              input: data.input,
              output: data.output,
              metadata: data.metadata,
            },
          })
          setDraftRow(null)
          setRid(result.rowId)
          getQueryClient().invalidateQueries({
            queryKey: ["datasets", projectId],
          })
          getQueryClient().invalidateQueries({
            queryKey: ["datasetRows", datasetId],
          })
          getQueryClient().invalidateQueries({
            queryKey: ["datasetRowCount", datasetId],
          })
          getQueryClient().invalidateQueries({
            queryKey: ["datasetRow", datasetId, result.rowId],
          })
          return
        }

        await updateDatasetRow({
          data: {
            datasetId,
            rowId: rid,
            input: data.input,
            output: data.output,
            metadata: data.metadata,
          },
        })
        getQueryClient().invalidateQueries({
          queryKey: ["datasets", projectId],
        })
        getQueryClient().invalidateQueries({
          queryKey: ["datasetRows", datasetId],
        })
        getQueryClient().invalidateQueries({
          queryKey: ["datasetRowCount", datasetId],
        })
        getQueryClient().invalidateQueries({
          queryKey: ["datasetRow", datasetId, rid],
        })
      } finally {
        setSaving(false)
      }
    },
    [rid, datasetId, projectId, setRid],
  )

  const handleDeleteRows = useCallback(async () => {
    const { bulkSelection, selectedRowIds } = selection
    if (!bulkSelection) return

    const hadDraftSelected = selectedRowIds.some((id) => isDatasetDraftRowId(id))

    const serverSelection =
      bulkSelection.mode === "selected"
        ? {
            ...bulkSelection,
            rowIds: bulkSelection.rowIds.filter((id) => !isDatasetDraftRowId(id)),
          }
        : bulkSelection

    if (serverSelection.mode === "selected" && serverSelection.rowIds.length === 0) {
      if (hadDraftSelected) {
        setDraftRow(null)
        if (rid && isDatasetDraftRowId(rid)) closeRow()
      }
      selection.clearSelections()
      setDeleteModalOpen(false)
      return
    }

    setDeleting(true)
    try {
      await deleteDatasetRows({
        data: { datasetId, selection: serverSelection },
      })

      if (rid && (bulkSelection.mode === "all" || selectedRowIds.includes(rid))) {
        if (isDatasetDraftRowId(rid)) setDraftRow(null)
        closeRow()
      } else if (hadDraftSelected) {
        setDraftRow(null)
      }

      selection.clearSelections()
      setDeleteModalOpen(false)
      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId],
      })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRowCount", datasetId],
      })
      getQueryClient().invalidateQueries({ queryKey: ["dataset", datasetId] })
    } finally {
      setDeleting(false)
    }
  }, [selection, datasetId, projectId, rid, closeRow])

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const { headers, rows } = parseDatasetCsv(text)
        if (headers.length === 0) return
        onImport({ headers, rows, file })
      } catch {
        // Silently ignore parse errors
      }
    },
    [onImport],
  )

  const triggerDownload = useCallback(
    async (sel: BulkSelection<string>) => {
      setDownloading(true)
      try {
        const result = await getDatasetDownload({
          data: { datasetId, selection: sel },
        })
        if (result.type === "enqueued") {
          toast({
            title: "Export started",
            description: "You'll receive an email with a download link when your export is ready.",
          })
          return
        }
        const blob = new Blob([result.csv], {
          type: "text/csv;charset=utf-8;",
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = result.filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
      } catch (e) {
        toast({
          variant: "destructive",
          description: e instanceof Error ? e.message : "Download failed",
        })
      } finally {
        setDownloading(false)
      }
    },
    [datasetId],
  )

  const handleDownload = useCallback(() => {
    const { bulkSelection } = selection
    if (!bulkSelection) return
    triggerDownload(bulkSelection)
  }, [selection, triggerDownload])

  const handleDownloadAll = useCallback(() => {
    triggerDownload({ mode: "all" })
  }, [triggerDownload])

  const getRowKey = useCallback((r: DatasetRowRecord) => r.rowId, [])

  return (
    <>
      <Layout>
        <Layout.Content>
          <Layout.Actions>
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                <DatasetNameEdit dataset={dataset} onDownload={handleDownloadAll} />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                {selection.selectedCount > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={downloading}
                      isLoading={downloading}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteModalOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
              </Layout.ActionRowItem>
              <Layout.ActionRowItem>
                <Input type="text" placeholder="Search rows..." value={q} onChange={(e) => setQ(e.target.value)} />
                <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()}>
                  <FileDownIcon className="h-4 w-4" />
                  <Text.H6>Import</Text.H6>
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImportFile(file)
                  }}
                />
                <Button variant="outline" size="sm" onClick={handleAddRow} disabled={saving}>
                  <CirclePlus className="h-4 w-4" />
                  Add row
                </Button>
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
          <Layout.List>
            <InfiniteTable<DatasetRowRecord>
              data={displayRows}
              isLoading={isLoading}
              columns={rowColumns}
              getRowKey={getRowKey}
              onRowClick={openRow}
              activeRowKey={rid}
              activeRowAutoScroll
              selection={selection}
              infiniteScroll={infiniteScroll}
              sorting={sorting}
              defaultSorting={DEFAULT_ROW_SORTING}
              onSortChange={handleSortChange}
              blankSlate="No rows found."
            />
          </Layout.List>
        </Layout.Content>
        {rid && selectedRow ? (
          <Layout.Aside>
            <RowDetailDrawer
              key={selectedRow.rowId}
              row={selectedRow}
              onClose={closeRow}
              onSave={handleSaveRow}
              saving={saving}
              isDraft={isDatasetDraftRowId(selectedRow.rowId)}
              canNavigatePrev={canNavigatePrev}
              canNavigateNext={canNavigateNext}
              onNavigatePrev={() => navigateAdjacentRow(-1)}
              onNavigateNext={() => navigateAdjacentRow(1)}
              {...(rowNavIndex >= 0 ? { rowDisplayIndex: rowNavIndex + 1 } : {})}
            />
          </Layout.Aside>
        ) : null}
      </Layout>

      <DeleteRowsModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        selectedCount={selection.selectedCount}
        isAllSelected={selection.bulkSelection?.mode === "all"}
        onConfirm={handleDeleteRows}
        deleting={deleting}
      />
    </>
  )
}
