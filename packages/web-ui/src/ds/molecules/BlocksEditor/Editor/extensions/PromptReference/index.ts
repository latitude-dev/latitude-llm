import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import PromptSelectorNodeView, { type Attr } from './View'

export const PromptReference = Node.create<Attr>({
  name: 'prompt',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      id: { default: () => crypto.randomUUID() },
      errors: { default: [] },
      path: { default: '' },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(PromptSelectorNodeView)
  },
})
