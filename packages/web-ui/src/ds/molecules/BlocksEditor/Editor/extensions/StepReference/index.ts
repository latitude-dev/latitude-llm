import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import View, { type Attr } from './View'

export const StepReference = Node.create<Attr>({
  name: 'step',
  group: 'block',
  content: 'block+',
  inline: false,
  atom: false,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: () => crypto.randomUUID() },
      errors: { default: [] },
      as: { default: null },
      isolated: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="step"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'step' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(View)
  },
})

