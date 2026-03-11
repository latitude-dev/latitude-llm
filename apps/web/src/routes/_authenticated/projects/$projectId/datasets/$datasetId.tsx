import { Button, Container, Input, Skeleton, TableSkeleton, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { FileUp, Loader2, Upload } from "lucide-react"
import Papa from "papaparse"
import { useCallback, useDeferredValue, useRef, useState } from "react"
import { ColumnMapper } from "../../../../../components/datasets/column-mapper.tsx"
import { CsvPreviewTable } from "../../../../../components/datasets/csv-preview-table.tsx"
import { DatasetTable } from "../../../../../components/datasets/dataset-table.tsx"
import { RowDetailPanel } from "../../../../../components/datasets/row-detail-panel.tsx"
import { VersionBadge } from "../../../../../components/datasets/version-badge.tsx"
import { useDatasetRowsCollection, useDatasetsCollection } from "../../../../../domains/datasets/datasets.collection.ts"
import type {
  ColumnMapping,
  CsvTransformOptions,
  DatasetRecord,
  DatasetRowRecord,
} from "../../../../../domains/datasets/datasets.functions.ts"
import { saveDatasetCsv } from "../../../../../domains/datasets/datasets.functions.ts"
import { getQueryClient } from "../../../../../lib/data/query-client.tsx"

export const Route = createFileRoute("/_authenticated/projects/$projectId/datasets/$datasetId")({
  component: DatasetDetailPage,
})

interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  file: File
}

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
    return <DatasetRowsView projectId={projectId} datasetId={datasetId} dataset={dataset} />
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

function UploadBlankSlate({
  dataset,
  onParsed,
}: {
  dataset: DatasetRecord
  onParsed: (csv: ParsedCsv) => void
}) {
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
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })

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

        <div
          className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-16 transition-colors ${
            isDragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
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
  const [mapping, setMapping] = useState<ColumnMapping>(() => ({
    input: [...parsedCsv.headers],
    output: [],
    metadata: [],
  }))
  const [options, setOptions] = useState<CsvTransformOptions>({
    flattenSingleColumn: false,
    autoParseJson: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", parsedCsv.file)
      formData.append("datasetId", datasetId)
      formData.append("projectId", projectId)
      formData.append("mapping", JSON.stringify(mapping))
      formData.append("options", JSON.stringify(options))

      await saveDatasetCsv({ data: formData })

      getQueryClient().invalidateQueries({ queryKey: ["datasets", projectId] })
      getQueryClient().invalidateQueries({ queryKey: ["datasetRows", datasetId] })
      onCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save dataset")
    } finally {
      setSaving(false)
    }
  }, [parsedCsv.file, datasetId, projectId, mapping, options, onCancel])

  return (
    <Container size="full">
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex flex-row items-center justify-between px-2">
          <div className="flex flex-row items-center gap-3">
            <Text.H3 weight="bold">{dataset.name}</Text.H3>
            <Text.H6 color="foregroundMuted">{parsedCsv.file.name}</Text.H6>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>
            <Text.H6>Cancel</Text.H6>
          </Button>
        </div>

        {error && (
          <div className="flex flex-row items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <Text.H5 color="destructive">{error}</Text.H5>
          </div>
        )}

        <div className="flex flex-row flex-1 min-h-0 border rounded-lg overflow-hidden">
          <div className="flex flex-col w-3/5 min-h-0 border-r">
            <CsvPreviewTable
              csvRows={parsedCsv.rows}
              totalRows={parsedCsv.rows.length}
              mapping={mapping}
              options={options}
            />
          </div>
          <div className="flex flex-col w-2/5 min-h-0">
            <ColumnMapper
              headers={parsedCsv.headers}
              mapping={mapping}
              onMappingChange={setMapping}
              options={options}
              onOptionsChange={setOptions}
              onSave={handleSave}
              saving={saving}
            />
          </div>
        </div>
      </div>
    </Container>
  )
}

function DatasetRowsView({
  projectId,
  datasetId,
  dataset,
}: {
  projectId: string
  datasetId: string
  dataset: DatasetRecord
}) {
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [selectedRow, setSelectedRow] = useState<DatasetRowRecord | null>(null)
  const rowsCollection = useDatasetRowsCollection(datasetId, deferredSearch)
  const rows = rowsCollection.data
  const isLoading = !rowsCollection.data

  return (
    <Container>
      <div className="flex flex-col gap-4 flex-1 min-h-0">
        <div className="flex flex-row items-center justify-between">
          <Text.H3 weight="bold">{dataset.name}</Text.H3>
          {dataset.latestVersionId && <VersionBadge versionId={dataset.latestVersionId} />}
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
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <TableSkeleton cols={4} rows={8} />
              ) : rows.length > 0 ? (
                <DatasetTable rows={rows} selectedRowId={selectedRow?.rowId ?? null} onSelectRow={setSelectedRow} />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Text.H5 color="foregroundMuted">No rows found</Text.H5>
                </div>
              )}
            </div>
          </div>

          {selectedRow && (
            <div className="w-1/2 min-h-0">
              <RowDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}
