import { type DatasetColumn, effectiveColumns } from "@domain/datasets"
import { DetailSection, Icon, RichTextEditor, Text } from "@repo/ui"
import { ArrowDownRightIcon, ArrowUpRightIcon, PencilIcon, SparklesIcon, TextIcon } from "lucide-react"
import { useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react"
import type { DatasetRowRecord } from "../../../../../../domains/datasets/datasets.functions.ts"

export type RowDetailPanelSaveRef = { save: () => void }

export interface RowDetailSaveData {
  input: string
  output: string
  expectedOutput: string
  metadata: string
  custom: Record<string, string>
}

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

const BUILTIN_META: Record<
  "input" | "output" | "expectedOutput" | "metadata",
  { icon: typeof TextIcon; hint?: string }
> = {
  expectedOutput: {
    icon: SparklesIcon,
    hint: "The correct answer for this row. Fill it in by hand; it's different from `output`.",
  },
  input: { icon: ArrowDownRightIcon },
  output: { icon: ArrowUpRightIcon },
  metadata: { icon: TextIcon },
}

export function RowDetailPanel({
  row,
  columns = null,
  onSave,
  saveRef,
  isDraft = false,
  onSaveVisibilityChange,
}: {
  row: DatasetRowRecord
  columns?: DatasetColumn[] | null
  onSave?: (data: RowDetailSaveData) => void
  saveRef?: React.RefObject<RowDetailPanelSaveRef | null>
  isDraft?: boolean
  onSaveVisibilityChange?: (visible: boolean) => void
}) {
  const visible = useMemo(() => effectiveColumns(columns), [columns])
  const visibleBuiltins = useMemo(
    () => new Set(visible.filter((c) => c.source.kind === "builtin").map((c) => c.identifier)),
    [visible],
  )
  const customColumns = useMemo(() => visible.filter((c) => c.source.kind === "custom"), [visible])

  const [inputText, setInputText] = useState(() => formatField(row.input))
  const [outputText, setOutputText] = useState(() => formatField(row.output))
  const [expectedOutputText, setExpectedOutputText] = useState(() => formatField(row.expectedOutput))
  const [metadataText, setMetadataText] = useState(() => formatField(row.metadata))
  const [customText, setCustomText] = useState<Record<string, string>>(() =>
    Object.fromEntries(customColumns.map((c) => [c.identifier, formatField(row.custom[c.identifier])])),
  )

  const setCustomCell = useCallback((identifier: string, value: string) => {
    setCustomText((prev) => ({ ...prev, [identifier]: value }))
  }, [])

  const handleSave = useCallback(() => {
    const custom = Object.fromEntries(customColumns.map((c) => [c.identifier, customText[c.identifier] ?? ""]))
    onSave?.({
      input: inputText,
      output: outputText,
      expectedOutput: expectedOutputText,
      metadata: metadataText,
      custom,
    })
  }, [inputText, outputText, expectedOutputText, metadataText, customText, customColumns, onSave])

  useImperativeHandle(saveRef, () => ({ save: handleSave }), [handleSave])

  const customDirty = customColumns.some(
    (c) => (customText[c.identifier] ?? "") !== formatField(row.custom[c.identifier]),
  )
  const isDirty =
    inputText !== formatField(row.input) ||
    outputText !== formatField(row.output) ||
    expectedOutputText !== formatField(row.expectedOutput) ||
    metadataText !== formatField(row.metadata) ||
    customDirty
  const showSaveButton = Boolean(onSave) && (isDraft || isDirty)
  const isEditable = Boolean(onSave)

  useEffect(() => {
    if (!onSave) {
      onSaveVisibilityChange?.(false)
      return
    }
    onSaveVisibilityChange?.(showSaveButton)
  }, [onSave, onSaveVisibilityChange, showSaveButton])

  const builtinState: Record<"input" | "output" | "expectedOutput" | "metadata", [string, (v: string) => void]> = {
    input: [inputText, setInputText],
    output: [outputText, setOutputText],
    expectedOutput: [expectedOutputText, setExpectedOutputText],
    metadata: [metadataText, setMetadataText],
  }

  return (
    <div className="flex flex-col gap-8">
      {isEditable && (
        <div className="flex flex-row items-center gap-2 rounded-md border border-dashed border-border bg-secondary/30 px-3 py-2">
          <Icon icon={PencilIcon} size="sm" color="foregroundMuted" />
          <Text.H6 color="foregroundMuted">All sections below are editable. Cmd+S saves the row.</Text.H6>
        </div>
      )}
      {visible.map((col) => {
        if (col.source.kind === "builtin") {
          const field = col.source.field
          if (!visibleBuiltins.has(col.identifier)) return null
          const [value, setValue] = builtinState[field]
          const meta = BUILTIN_META[field]
          return (
            <DetailSection
              key={col.identifier}
              icon={<Icon icon={meta.icon} size="sm" />}
              label={col.name}
              contentClassName="max-h-none overflow-visible gap-2"
            >
              {isEditable && meta.hint && value.length === 0 && (
                <Text.H6 color="foregroundMuted" className="italic">
                  {meta.hint}
                </Text.H6>
              )}
              <RichTextEditor value={value} onChange={setValue} />
            </DetailSection>
          )
        }
        return (
          <DetailSection
            key={col.identifier}
            icon={<Icon icon={TextIcon} size="sm" />}
            label={col.name}
            contentClassName="max-h-none overflow-visible"
          >
            <RichTextEditor
              value={customText[col.identifier] ?? ""}
              onChange={(v) => setCustomCell(col.identifier, v)}
            />
          </DetailSection>
        )
      })}
    </div>
  )
}
