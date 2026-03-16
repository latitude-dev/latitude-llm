import { Button, Text } from "@repo/ui"
import { useCallback, useState } from "react"
import type { ColumnMapping, CsvTransformOptions } from "../../../../../../domains/datasets/column-mapping.ts"
import { toUserMessage } from "../../../../../../lib/errors.ts"
import { ColumnMapper } from "./column-mapper.tsx"
import { CsvPreviewTable } from "./csv-preview-table.tsx"

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  file: File
}

interface CsvImportViewProps {
  title: string
  subtitle?: string
  parsedCsv: ParsedCsv
  onCancel: () => void
  onSave: (args: { file: File; mapping: ColumnMapping; options: CsvTransformOptions }) => Promise<void>
}

export function CsvImportView({ title, subtitle, parsedCsv, onCancel, onSave }: CsvImportViewProps) {
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
      await onSave({ file: parsedCsv.file, mapping, options })
    } catch (e) {
      setError(toUserMessage(e))
    } finally {
      setSaving(false)
    }
  }, [parsedCsv.file, mapping, options, onSave])

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex flex-row items-center justify-between px-2">
        <div className="flex flex-row items-center gap-3">
          <Text.H3 weight="bold">{title}</Text.H3>
          {subtitle && <Text.H6 color="foregroundMuted">{subtitle}</Text.H6>}
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
  )
}
