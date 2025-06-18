import { type AnyBlock } from '@latitude-data/constants/simpleBlocks'

export interface BlocksEditorProps {
  blocks: AnyBlock[]
  onUpdate: (content: string) => void
  placeholder: string
  editable?: boolean
}
