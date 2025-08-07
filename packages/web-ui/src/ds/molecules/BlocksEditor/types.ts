import { ComponentType, EventHandler, MouseEvent, ReactNode } from 'react'
import type { UrlObject } from 'url'
import { ConversationMetadata } from 'promptl-ai'
import { BlockRootNode } from './Editor/state/promptlToLexical/types'

export type IncludedPrompt = {
  url: string
  path: string
  id: number
  projectId: number
  commitUuid: string
  documentUuid: string
}

export type BlocksEditorProps = {
  currentDocument: { path: string }
  initialValue: BlockRootNode
  placeholder: string
  onToggleDevEditor: () => void
  onError: (error: Error) => void
  Link: ComponentType<{
    children: ReactNode
    href: string | UrlObject
    className?: string
    onClick?: EventHandler<MouseEvent<HTMLAnchorElement>>
  }>
  prompts: Record<string, IncludedPrompt>
  onRequestPromptMetadata: (
    prompt: IncludedPrompt,
  ) => Promise<ConversationMetadata>
  onChange: (value: string) => void
  className?: string
  readOnlyMessage?: string
  autoFocus?: boolean
}
