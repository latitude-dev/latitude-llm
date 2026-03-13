import { Button, Container, cn, Input, Skeleton, TableSkeleton, Text } from "@repo/ui"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { FileUp, Loader2, Trash2, Upload } from "lucide-react"
import Papa from "papaparse"
import { useCallback, useDeferredValue, useRef, useState } from "react"
import { z } from "zod"
import { CsvImportView, type ParsedCsv } from "../../../../../components/datasets/csv-import-view.tsx"
import { DatasetTable } from "../../../../../components/datasets/dataset-table.tsx"
import { DeleteRowsModal } from "../../../../../components/datasets/delete-rows-modal.tsx"
import { RowDetailPanel } from "../../../../../components/datasets/row-detail-panel.tsx"
import { VersionBadge } from "../../../../../components/datasets/version-badge.tsx"
import { useDatasetRowsCollection, useDatasetsCollection } from "../../../../../domains/datasets/datasets.collection.ts"
import type { DatasetRecord, DatasetRowRecord } from "../../../../../domains/datasets/datasets.functions.ts"
import {
  deleteRowsMutation,
  saveDatasetCsv,
  updateRowMutation,
} from "../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"
import { useSelectableRows } from "../../../../../lib/hooks/useSelectableRows.ts"

const datasetSearchSchema = z.object({
  rid: z.string().optional(),
})

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/$datasetId")({
  component: DatasetDetailPage,
  validateSearch: datasetSearchSchema,
})

function DatasetDetailPage() {
  const { projectId, datasetId } = Route.useParams()

  const datasetsCollection = useDatasetsCollection(projectId)
  const dataset = datasetsCollection.data?.find((d) => d.id === datasetId)
  const isLoading = !datasetsCollection.data

  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null)

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

  const hasRows = dataset.currentVersion > 0

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

  return <UploadBlankSlate dataset={dataset} onParsed={setParsedCsv} />
}

function UploadBlankSlate({ dataset, onParsed }: { dataset: DatasetRecord; onParsed: (csv: ParsedCsv) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      setError(null)
      try {
        const text = await file.text()
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        })

        if (!result.meta.fields || result.meta.fields.length === 0) {
          setError("Could not detect any columns in this CSV")
          return
        }

        onParsed({ headers: result.meta.fields, rows: result.data, file })
      } catch {
        setError("Failed to parse CSV file")
      } finally {
        setParsing(false)
      }
    },
    [onParsed],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <Container>
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <Text.H3 weight="bold">{dataset.name}</Text.H3>

        {error && (
          <div className="flex flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <Text.H5 color="destructive">{error}</Text.H5>
          </div>
        )}

        {/* biome-ignore lint/a11y/useSemanticElements: drop zone requires div for drag events */}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-16 transition-colors",
            {
              "border-primary bg-primary/5": isDragOver,
              "border-border": !isDragOver,
            },
          )}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click()
          }}
        >
          {parsing ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <Text.H5 color="foregroundMuted">Reading CSV...</Text.H5>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div className="flex flex-col items-center gap-1">
                <Text.H4 weight="bold">Upload a CSV file</Text.H4>
                <Text.H5 color="foregroundMuted">Drag and drop your CSV file here to populate this dataset</Text.H5>
              </div>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileUp className="h-4 w-4" />
                <Text.H5>Choose file</Text.H5>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  )
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
      formData.append("datasetId", datasetId)
      formData.append("projectId", projectId)
      formData.append("mapping", JSON.stringify(mapping))
      formData.append("options", JSON.stringify(options))

      await saveDatasetCsv({ data: formData })

      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId],
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
  const navigate = useNavigate()
  const { rid } = Route.useSearch()
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(rid ?? null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(dataset.currentVersion)
  const [currentVersionId, setCurrentVersionId] = useState(dataset.latestVersionId)
  const rowsCollection = useDatasetRowsCollection(datasetId, deferredSearch)
  const rows = rowsCollection.data ?? []
  const isLoading = !rowsCollection.data
  const selectedRow = selectedRowId ? (rows.find((r) => r.rowId === selectedRowId) ?? null) : null

  const importFileRef = useRef<HTMLInputElement>(null)

  const rowIds = rows.map((r) => r.rowId)
  const selection = useSelectableRows({
    rowIds,
    totalRowCount: rows.length,
  })

  const openRow = useCallback(
    (row: DatasetRowRecord) => {
      setSelectedRowId(row.rowId)
      navigate({
        to: ".",
        search: { rid: row.rowId },
        replace: true,
      })
    },
    [navigate],
  )

  const closeRow = useCallback(() => {
    setSelectedRowId(null)
    navigate({
      to: ".",
      search: {},
      replace: true,
    })
  }, [navigate])

  const handleSaveRow = useCallback(
    async (data: { input: string; output: string; metadata: string }) => {
      if (!selectedRowId) return
      setSaving(true)
      try {
        const result = await updateRowMutation({
          data: {
            datasetId,
            rowId: selectedRowId,
            input: data.input,
            output: data.output,
            metadata: data.metadata,
          },
        })
        setCurrentVersion(result.version)
        setCurrentVersionId(result.versionId)
        getQueryClient().invalidateQueries({
          queryKey: ["datasets", projectId],
        })
        getQueryClient().invalidateQueries({
          queryKey: ["datasetRows", datasetId],
        })
      } finally {
        setSaving(false)
      }
    },
    [selectedRowId, datasetId, projectId],
  )

  const handleDeleteRows = useCallback(async () => {
    const ids = selection.selectedRowIds
    if (ids.length === 0) return
    setDeleting(true)
    try {
      const result = await deleteRowsMutation({
        data: { datasetId, rowIds: ids as string[] },
      })
      setCurrentVersion(result.version)
      setCurrentVersionId(result.versionId)

      if (selectedRowId && ids.includes(selectedRowId)) {
        closeRow()
      }

      selection.clearSelections()
      setDeleteModalOpen(false)
      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      getQueryClient().invalidateQueries({
        queryKey: ["datasetRows", datasetId],
      })
    } finally {
      setDeleting(false)
    }
  }, [selection, datasetId, projectId, selectedRowId, closeRow])

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        })
        if (!result.meta.fields || result.meta.fields.length === 0) return
        onImport({ headers: result.meta.fields, rows: result.data, file })
      } catch {
        // Silently ignore parse errors
      }
    },
    [onImport],
  )

  return (
    <Container>
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex flex-row items-center justify-between">
          <div className="flex flex-row items-center gap-3">
            <Text.H3 weight="bold">{dataset.name}</Text.H3>
            <VersionBadge versionId={currentVersionId} version={currentVersion} />
          </div>
          <div className="flex flex-row items-center gap-2">
            {selection.selectedCount > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteModalOpen(true)}>
                <Trash2 className="h-4 w-4" />
                <Text.H6 color="white">Delete {selection.selectedCount}</Text.H6>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()}>
              <FileUp className="h-4 w-4" />
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
          </div>
        </div>

        <div className="flex flex-row flex-1 min-h-0 border rounded-lg overflow-hidden">
          <div className={`flex flex-col ${selectedRow ? "w-1/2" : "w-full"} min-h-0`}>
            <div className="flex flex-row items-center gap-2 px-4 py-3 border-b">
              <Input
                type="text"
                placeholder="Search rows..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <TableSkeleton cols={5} rows={8} />
              ) : rows.length > 0 ? (
                <DatasetTable
                  rows={rows}
                  selectedRowId={selectedRow?.rowId ?? null}
                  onSelectRow={openRow}
                  headerCheckboxState={selection.headerState}
                  onToggleAll={selection.toggleAll}
                  isRowSelected={selection.isSelected}
                  onToggleRow={selection.toggleRow}
                />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Text.H5 color="foregroundMuted">No rows found</Text.H5>
                </div>
              )}
            </div>
          </div>

          {selectedRow && (
            <div className="w-1/2 min-h-0">
              <RowDetailPanel row={selectedRow} onClose={closeRow} onSave={handleSaveRow} saving={saving} />
            </div>
          )}
        </div>
      </div>

      <DeleteRowsModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        selectedCount={selection.selectedCount}
        onConfirm={handleDeleteRows}
        deleting={deleting}
      />
    </Container>
  )
}
