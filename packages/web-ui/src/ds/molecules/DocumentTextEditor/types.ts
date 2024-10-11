import { ReactNode } from 'react'

import { ConversationMetadata } from '@latitude-data/compiler'

export type DiffOptions = {
  newValue: string
  description?: string
  onAccept: (newValue: string) => void
  onReject: () => void
}

export type DocumentTextEditorProps = {
  value: string
  path?: string
  metadata?: ConversationMetadata
  onChange?: (value: string) => void
  readOnlyMessage?: string
  isSaved?: boolean
  actionButtons?: ReactNode
  diff?: DiffOptions
  copilot?: {
    isLoading: boolean
    requestSuggestion: (_: string) => void
  }
}

export type DocumentError = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
}
