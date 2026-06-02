import { DetailSection, Icon, RichTextEditor, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, PencilIcon, SparklesIcon, TextIcon } from "lucide-react"
import { useCallback, useEffect, useImperativeHandle, useState } from "react"
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
  onSave?: (data: { input: string; output: string; expectedOutput: string; metadata: string }) => void
  saveRef?: React.RefObject<RowDetailPanelSaveRef | null>
  isDraft?: boolean
  onSaveVisibilityChange?: (visible: boolean) => void
}) {
  const [inputText, setInputText] = useState(() => formatField(row.input))
  const [outputText, setOutputText] = useState(() => formatField(row.output))
  const [expectedOutputText, setExpectedOutputText] = useState(() => formatField(row.expectedOutput))
  const [metadataText, setMetadataText] = useState(() => formatField(row.metadata))

  const handleSave = useCallback(() => {
    onSave?.({
      input: inputText,
      output: outputText,
      expectedOutput: expectedOutputText,
      metadata: metadataText,
    })
  }, [inputText, outputText, expectedOutputText, metadataText, onSave])

  useImperativeHandle(saveRef, () => ({ save: handleSave }), [handleSave])

  const baselineInput = formatField(row.input)
  const baselineOutput = formatField(row.output)
  const baselineExpected = formatField(row.expectedOutput)
  const baselineMetadata = formatField(row.metadata)
  const isDirty =
    inputText !== baselineInput ||
    outputText !== baselineOutput ||
    expectedOutputText !== baselineExpected ||
    metadataText !== baselineMetadata
  const showSaveButton = Boolean(onSave) && (isDraft || isDirty)
  const isEditable = Boolean(onSave)

  useEffect(() => {
    if (!onSave) {
      onSaveVisibilityChange?.(false)
      return
    }
    onSaveVisibilityChange?.(showSaveButton)
  }, [onSave, onSaveVisibilityChange, showSaveButton])

  return (
    <div className="flex flex-col gap-8">
      {isEditable && (
        <div className="flex flex-row items-center gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2">
          <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
          <Text.H6 color="foregroundMuted">All sections below are editable. Cmd+S saves the row.</Text.H6>
        </div>
      )}
      <DetailSection
        icon={<Icon icon={SparklesIcon} size="sm" />}
        label="Expected output"
        contentClassName="max-h-none overflow-visible gap-2"
      >
        {isEditable && expectedOutputText.length === 0 && (
          <Text.H6 color="foregroundMuted" className="italic">
            The correct answer for this row. Fill in by hand — not the same as `output`.
          </Text.H6>
        )}
        <RichTextEditor value={expectedOutputText} onChange={setExpectedOutputText} />
      </DetailSection>
      <DetailSection
        icon={<Icon icon={ArrowDownRightIcon} size="sm" />}
        label="Input"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={inputText} onChange={setInputText} />
      </DetailSection>
      <DetailSection
        icon={<Icon icon={ArrowUpRightIcon} size="sm" />}
        label="Output"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={outputText} onChange={setOutputText} />
      </DetailSection>
      <DetailSection
        icon={<Icon icon={TextIcon} size="sm" />}
        label="Metadata"
        contentClassName="max-h-none overflow-visible"
      >
        <RichTextEditor value={metadataText} onChange={setMetadataText} />
      </DetailSection>
    </div>
  )
}
