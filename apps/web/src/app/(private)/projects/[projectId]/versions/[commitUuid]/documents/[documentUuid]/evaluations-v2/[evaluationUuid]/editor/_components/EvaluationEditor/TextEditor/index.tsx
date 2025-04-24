import { Suspense } from 'react'
import { CompileError } from 'promptl-ai'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'

export function TextEditor({
  compileErrors,
  value,
  defaultValue,
  isSaved,
  isMerged,
  onChange,
}: {
  compileErrors: CompileError[] | undefined
  value: string
  defaultValue?: string
  isSaved: boolean
  isMerged: boolean
  onChange: (value: string) => void
}) {
  return (
    <Suspense fallback={<TextEditorPlaceholder />}>
      <DocumentTextEditor
        autoFocus
        value={value}
        defaultValue={defaultValue}
        compileErrors={compileErrors}
        onChange={onChange}
        readOnlyMessage={
          isMerged ? 'Create a draft to edit this evaluation.' : undefined
        }
        isSaved={isSaved}
      />
    </Suspense>
  )
}
