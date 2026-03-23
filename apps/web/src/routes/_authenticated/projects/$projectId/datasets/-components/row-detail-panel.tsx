import { DetailSection, RichTextEditor } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, TextIcon } from "lucide-react"
import { useCallback, useImperativeHandle, useMemo, useState } from "react"
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
  onDirtyChange,
}: {
  row: DatasetRowRecord
  onSave?: (data: { input: string; output: string; metadata: string }) => void
  saveRef?: React.RefObject<RowDetailPanelSaveRef | null>
  onDirtyChange?: (isDirty: boolean) => void
}) {
  const [inputText, setInputText] = useState(() => formatField(row.input))
  const [outputText, setOutputText] = useState(() => formatField(row.output))
  const [metadataText, setMetadataText] = useState(() => formatField(row.metadata))

  const baselineInput = useMemo(() => formatField(row.input), [row.input])
  const baselineOutput = useMemo(() => formatField(row.output), [row.output])
  const baselineMetadata = useMemo(() => formatField(row.metadata), [row.metadata])

  const wrappedSetInputText = useCallback(
    (value: string) => {
      setInputText(value)
      const newIsDirty = value !== baselineInput || outputText !== baselineOutput || metadataText !== baselineMetadata
      onDirtyChange?.(newIsDirty)
    },
    [baselineInput, outputText, baselineOutput, metadataText, baselineMetadata, onDirtyChange],
  )

  const wrappedSetOutputText = useCallback(
    (value: string) => {
      setOutputText(value)
      const newIsDirty = inputText !== baselineInput || value !== baselineOutput || metadataText !== baselineMetadata
      onDirtyChange?.(newIsDirty)
    },
    [inputText, baselineInput, baselineOutput, metadataText, baselineMetadata, onDirtyChange],
  )

  const wrappedSetMetadataText = useCallback(
    (value: string) => {
      setMetadataText(value)
      const newIsDirty = inputText !== baselineInput || outputText !== baselineOutput || value !== baselineMetadata
      onDirtyChange?.(newIsDirty)
    },
    [inputText, baselineInput, outputText, baselineOutput, baselineMetadata, onDirtyChange],
  )

  const handleSave = useCallback(() => {
    onSave?.({ input: inputText, output: outputText, metadata: metadataText })
  }, [inputText, outputText, metadataText, onSave])

  useImperativeHandle(saveRef, () => ({ save: handleSave }), [handleSave])

  return (
    <div className="flex flex-col gap-8">
      <DetailSection
        icon={<ArrowDownRightIcon className="h-4 w-4" />}
        label="Input"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={inputText} onChange={wrappedSetInputText} />
      </DetailSection>
      <DetailSection
        icon={<ArrowUpRightIcon className="h-4 w-4" />}
        label="Output"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={outputText} onChange={wrappedSetOutputText} />
      </DetailSection>
      <DetailSection
        icon={<TextIcon className="h-4 w-4" />}
        label="Metadata"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={metadataText} onChange={wrappedSetMetadataText} />
      </DetailSection>
    </div>
  )
}
