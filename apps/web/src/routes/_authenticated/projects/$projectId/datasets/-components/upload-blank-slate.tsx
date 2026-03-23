import { parseDatasetCsv } from "@domain/datasets"
import { Button, Icon, Modal, Text, toast } from "@repo/ui"
import { CirclePlus, FileUp, ImportIcon, Loader2, Save } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import type { DatasetRecord } from "../../../../../../domains/datasets/datasets.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import type { ParsedCsv } from "./csv-import-view.tsx"
import { createDraftRowRecord } from "./dataset-draft-row.ts"
import { DatasetNameEdit } from "./dataset-name-edit.tsx"
import { RowDetailPanel, type RowDetailPanelSaveRef } from "./row-detail-panel.tsx"

export function UploadBlankSlate({
  dataset,
  onParsed,
  onInsertFirstRow,
}: {
  dataset: DatasetRecord
  onParsed: (csv: ParsedCsv) => void
  onInsertFirstRow: (data: { input: string; output: string; metadata: string }) => Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const addRowPanelSaveRef = useRef<RowDetailPanelSaveRef | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [addRowModalOpen, setAddRowModalOpen] = useState(false)
  const [addRowDraft, setAddRowDraft] = useState(() => createDraftRowRecord(dataset.id))
  const [addRowSaving, setAddRowSaving] = useState(false)

  const openAddRowModal = useCallback(() => {
    setAddRowDraft(createDraftRowRecord(dataset.id))
    setAddRowModalOpen(true)
  }, [dataset.id])

  const handleSaveNewRow = useCallback(
    async (data: { input: string; output: string; metadata: string }) => {
      setAddRowSaving(true)
      try {
        await onInsertFirstRow(data)
        setAddRowModalOpen(false)
      } catch {
      } finally {
        setAddRowSaving(false)
      }
    },
    [onInsertFirstRow],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      try {
        const text = await file.text()
        const { headers, rows } = parseDatasetCsv(text)

        if (headers.length === 0) {
          toast({
            variant: "destructive",
            description: "Could not detect any columns in this CSV",
          })
          return
        }

        onParsed({ headers, rows, file })
      } catch {
        toast({
          variant: "destructive",
          description: "Failed to parse CSV file",
        })
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
    <>
      <Layout>
        <Layout.Content>
          <Layout.Actions>
            <Layout.ActionsRow>
              <Layout.ActionRowItem>
                <DatasetNameEdit dataset={dataset} />
              </Layout.ActionRowItem>
            </Layout.ActionsRow>
          </Layout.Actions>
          <Layout.List>
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              {/* biome-ignore lint/a11y/useSemanticElements: drop zone requires div for drag events */}
              <div
                role="button"
                tabIndex={0}
                className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-16 transition-colors ${
                  isDragOver ? "border-primary bg-primary/5" : "border-border"
                }`}
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
                    <Icon icon={ImportIcon} size="md" color="primary" />
                    <div className="flex flex-col items-center gap-1">
                      <Text.H4B>Upload a CSV file</Text.H4B>
                      <Text.H5 color="foregroundMuted">
                        Drag and drop your CSV file in this area or start creating rows manually
                      </Text.H5>
                    </div>
                    <div className="flex flex-row flex-wrap items-center justify-center gap-3">
                      <Button flat variant="default" onClick={() => fileInputRef.current?.click()}>
                        <FileUp className="h-4 w-4" />
                        Choose file
                      </Button>
                      <Button flat variant="outline" onClick={openAddRowModal}>
                        <CirclePlus className="h-4 w-4" />
                        Add row
                      </Button>
                    </div>
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
          </Layout.List>
        </Layout.Content>
      </Layout>

      <Modal
        open={addRowModalOpen}
        onOpenChange={setAddRowModalOpen}
        title="Add row"
        description="Enter input, output, and metadata for your first row. This creates a new dataset version."
        dismissible
        footer={
          <>
            <Button variant="outline" onClick={() => setAddRowModalOpen(false)} disabled={addRowSaving}>
              Cancel
            </Button>
            <Button onClick={() => addRowPanelSaveRef.current?.save()} disabled={addRowSaving}>
              {addRowSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save row
            </Button>
          </>
        }
      >
        <RowDetailPanel
          key={addRowDraft.rowId}
          row={addRowDraft}
          isDraft
          onSave={handleSaveNewRow}
          saveRef={addRowPanelSaveRef}
        />
      </Modal>
    </>
  )
}
