import { LexicalEditor } from 'lexical'
import { BlockRootNode } from './promptlToLexical/types'

export const fromBlocksToLexical =
  (root: BlockRootNode) => (editor: LexicalEditor) => {
    const parsed = editor.parseEditorState({ root })
    editor.setEditorState(parsed)
  }
