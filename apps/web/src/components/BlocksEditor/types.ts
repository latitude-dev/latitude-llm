import { updateContentFn } from '$/hooks/useDocumentValueContext'
import { ConversationMetadata } from 'promptl-ai'
import { BlockRootNode } from './Editor/state/promptlToLexical/types'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
export type IncludedPrompt = {
  url: string
  path: string
  id: number
  projectId: number
  commitUuid: string
  documentUuid: string
}

export type BlocksEditorProps = {
  project: Project
  commit: Commit
  document: DocumentVersion
  currentDocument: { path: string }
  initialValue: BlockRootNode
  placeholder: string
  onToggleDevEditor?: () => void
  onError: (error: Error) => void
  prompts: Record<string, IncludedPrompt>
  onRequestPromptMetadata?: (
    prompt: IncludedPrompt,
  ) => Promise<ConversationMetadata>
  onChange: updateContentFn
  className?: string
  readOnlyMessage?: string
  autoFocus?: boolean
  greyTheme?: boolean
}
