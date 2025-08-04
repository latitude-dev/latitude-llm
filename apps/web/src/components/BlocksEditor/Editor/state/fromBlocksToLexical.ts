import { LexicalEditor } from 'lexical'
import { BlockRootNode } from './promptlToLexical/types'

type NodeWithReadOnly = { readOnly?: boolean; children?: NodeWithReadOnly[] }

function setReadOnly(node: NodeWithReadOnly, readOnly?: boolean) {
  node.readOnly = readOnly
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach((child) => setReadOnly(child, readOnly))
  }
}

export const fromBlocksToLexical =
  (root: BlockRootNode, readOnly?: boolean) => (editor: LexicalEditor) => {
    setReadOnly(root, readOnly)
    const parsed = editor.parseEditorState({ root })
    editor.setEditorState(parsed)
  }
