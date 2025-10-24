import { ReactNode } from 'react'

import { AstError } from '@latitude-data/constants/promptl'

export type DiffOptions = {
  oldValue?: string
  newValue: string
  description?: string
  source: 'latte' | 'refine' | 'suggestion' | 'experiment'
  onAccept?: (newValue: string) => void
  onReject?: () => void
}

export type DocumentTextEditorProps = {
  value: string
  defaultValue?: string
  path?: string
  compileErrors?: AstError[]
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
  highlightedCursorIndex?: number
}

export type DocumentError = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
}
