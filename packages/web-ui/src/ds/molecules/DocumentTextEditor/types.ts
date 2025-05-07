import { ReactNode } from 'react'

import type { CompileError } from 'promptl-ai'

export type DiffOptions = {
  newValue: string
  description?: string
  onAccept: (newValue: string) => void
  onReject: () => void
}

export type DocumentTextEditorProps = {
  value: string
  defaultValue?: string
  path?: string
  compileErrors?: CompileError[]
  onChange?: (value: string) => void
  autoFocus?: boolean
  readOnlyMessage?: string
  isSaved?: boolean
  actionButtons?: ReactNode
  diff?: DiffOptions
  copilot?: {
    isLoading: boolean
    requestSuggestion: (_: string) => void
    disabledMessage?: string
  }
  autoCompleteParameters?: string[]
}

export type DocumentError = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
}
