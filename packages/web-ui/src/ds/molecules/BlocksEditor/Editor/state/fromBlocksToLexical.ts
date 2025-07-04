import { LexicalEditor } from 'lexical'
import { BlockRootNode } from './promptlToLexical/types'

export function fromBlocksToLexical({
  root,
  editor,
}: {
  root: BlockRootNode
  editor: LexicalEditor
}) {
  editor.update(() => {
    const parsed = editor.parseEditorState({ root })
    editor.setEditorState(parsed)
  })
}
