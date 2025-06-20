import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import View, { type Attr } from './View'

export const PROMPT_REF_ID = 'prompt'
export const PromptReference = Node.create<Attr>({
  name: PROMPT_REF_ID,
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: { default: () => crypto.randomUUID() },
      errors: { default: [] },
      path: { default: '' },
      attributes: { default: {} },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-type': PROMPT_REF_ID }]
  },

  addNodeView() {
    return ReactNodeViewRenderer(View)
  },
})
