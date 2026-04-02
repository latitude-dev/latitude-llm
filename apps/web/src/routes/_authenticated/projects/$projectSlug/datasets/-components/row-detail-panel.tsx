import { DetailSection, RichTextEditor } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, TextIcon } from "lucide-react"
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

export type RowDetailPanelSaveRef = { save: () => void }

function formatField(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  if (typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function RowDetailPanel({
  row,
  onSave,
  saveRef,
  isDraft = false,
  onSaveVisibilityChange,
}: {
  row: DatasetRowRecord
  onSave?: (data: { input: string; output: string; metadata: string }) => void
  saveRef?: React.RefObject<RowDetailPanelSaveRef | null>
  isDraft?: boolean
  onSaveVisibilityChange?: (visible: boolean) => void
}) {
  const [inputText, setInputText] = useState(() => formatField(row.input))
  const [outputText, setOutputText] = useState(() => formatField(row.output))
  const [metadataText, setMetadataText] = useState(() => formatField(row.metadata))

  const rowIdentityRef = useRef({ rowId: row.rowId, version: row.version })
  if (rowIdentityRef.current.rowId !== row.rowId || rowIdentityRef.current.version !== row.version) {
    rowIdentityRef.current = { rowId: row.rowId, version: row.version }
    setInputText(formatField(row.input))
    setOutputText(formatField(row.output))
    setMetadataText(formatField(row.metadata))
  }

  const handleSave = useCallback(() => {
    onSave?.({ input: inputText, output: outputText, metadata: metadataText })
  }, [inputText, outputText, metadataText, onSave])

  useImperativeHandle(saveRef, () => ({ save: handleSave }), [handleSave])

  const baselineInput = formatField(row.input)
  const baselineOutput = formatField(row.output)
  const baselineMetadata = formatField(row.metadata)
  const isDirty = inputText !== baselineInput || outputText !== baselineOutput || metadataText !== baselineMetadata
  const showSaveButton = Boolean(onSave) && (isDraft || isDirty)

  useEffect(() => {
    if (!onSave) {
      onSaveVisibilityChange?.(false)
      return
    }
    onSaveVisibilityChange?.(showSaveButton)
  }, [onSave, onSaveVisibilityChange, showSaveButton])

  return (
    <div className="flex flex-col gap-8">
      <DetailSection
        icon={<ArrowDownRightIcon className="h-4 w-4" />}
        label="Input"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor key={`${row.rowId}-input-${row.version}`} value={inputText} onChange={setInputText} />
      </DetailSection>
      <DetailSection
        icon={<ArrowUpRightIcon className="h-4 w-4" />}
        label="Output"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor key={`${row.rowId}-output-${row.version}`} value={outputText} onChange={setOutputText} />
      </DetailSection>
      <DetailSection
        icon={<TextIcon className="h-4 w-4" />}
        label="Metadata"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor key={`${row.rowId}-metadata-${row.version}`} value={metadataText} onChange={setMetadataText} />
      </DetailSection>
    </div>
  )
}
