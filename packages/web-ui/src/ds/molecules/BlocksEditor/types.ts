import { ComponentType } from 'react'
import { AnyBlock } from '@latitude-data/constants/simpleBlocks'

export type JSONContent = object

export type IncludedPrompt = {
  url: string
  path: string
  id: number
  projectId: number
  commitUuid: string
  documentUuid: string
}

export type BlocksEditorProps = {
  placeholder?: string
  prompts: Record<string, IncludedPrompt>
  ReferenceLink: ComponentType<{ prompt: IncludedPrompt }>
  onRequestPromptMetadata: (
    prompt: IncludedPrompt,
  ) => Promise<{ parameters: string[] }>
  initialValue?: AnyBlock[] // Support both string and blocks array
  onChange?: (content: string) => void
  onBlocksChange?: (blocks: AnyBlock[]) => void // New callback for blocks
  className?: string
  readOnly?: boolean
  autoFocus?: boolean
}
