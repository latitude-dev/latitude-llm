import { AnyBlock } from '@latitude-data/constants/simpleBlocks'

export type JSONContent = object

export type BlocksEditorProps = {
  placeholder?: string
  initialValue?: AnyBlock[] // Support both string and blocks array
  onChange?: (content: string) => void
  onBlocksChange?: (blocks: AnyBlock[]) => void // New callback for blocks
  className?: string
  readOnly?: boolean
  autoFocus?: boolean
}
