import { ComponentType, EventHandler, MouseEvent, ReactNode } from 'react'
import { ConversationMetadata } from 'promptl-ai'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { type UrlObject } from 'url'

export type JSONContent = object

export type IncludedPrompt = {
  url: string
  path: string
  id: number
  projectId: number
  commitUuid: string
  documentUuid: string
}

export { type PromptBlock } from '@latitude-data/constants/simpleBlocks'

export type BlocksEditorProps = {
  placeholder?: string
  onToggleDevEditor: () => void
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
  initialValue?: AnyBlock[] // Support both string and blocks array
  onChange?: (content: string) => void
  onBlocksChange?: (blocks: AnyBlock[]) => void // New callback for blocks
  className?: string
  readOnly?: boolean
  autoFocus?: boolean
}
