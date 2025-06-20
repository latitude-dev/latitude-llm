import { type AnyBlock } from '@latitude-data/constants/simpleBlocks'
import { JSONContent as TipTabRawJSONContent } from '@tiptap/core'

export interface BlocksEditorProps {
  /* blocks: AnyBlock[] */
  content: JSONContent[]
  onUpdate: (content: JSONContent[]) => void
  placeholder: string
  editable?: boolean
}

export type JSONContent = TipTabRawJSONContent
