import { EditorSettings } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/EditorSettings'
import { LLM_EVALUATION_PROMPT_PARAMETERS } from '@latitude-data/constants'
import type { AstError } from '@latitude-data/constants/promptl'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { TextEditorPlaceholder } from '@latitude-data/web-ui/molecules/TextEditorPlaceholder'
import { Suspense } from 'react'

const DEFAULT_PARAMETERS =
  LLM_EVALUATION_PROMPT_PARAMETERS as unknown as string[]
const ALLOWED_PARAMETERS = [
  ...DEFAULT_PARAMETERS,
  'messages.all',
  'messages.first',
  'messages.last',
  'messages.user',
  'messages.user.all',
  'messages.user.first',
  'messages.user.last',
  'messages.assistant',
  'messages.assistant.all',
  'messages.assistant.first',
  'messages.assistant.last',
  'messages.system',
  'messages.system.all',
  'messages.system.first',
  'messages.system.last',
]

export function TextEditor({
  compileErrors,
  value,
  defaultValue,
  isSaved,
  isMerged,
  copilotEnabled = false,
  onChange,
}: {
  compileErrors: AstError[] | undefined
  value: string
  defaultValue?: string
  isSaved: boolean
  isMerged: boolean
  copilotEnabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Suspense fallback={<TextEditorPlaceholder />}>
      <DocumentTextEditor
        autoFocus
        value={value}
        autoCompleteParameters={ALLOWED_PARAMETERS}
        defaultValue={defaultValue}
        compileErrors={compileErrors}
        onChange={onChange}
        readOnlyMessage={
          isMerged ? 'Create a draft to edit this evaluation.' : undefined
        }
        isSaved={isSaved}
        actionButtons={<EditorSettings copilotEnabled={copilotEnabled} />}
      />
    </Suspense>
  )
}
