import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import View, { type Attr } from './View'

export const MessageReference = Node.create<Attr>({
  name: 'message',
  group: 'block',
  content: 'block+',
  inline: false,
  atom: false,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: () => crypto.randomUUID() },
      role: { default: 'system' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="message"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'message' }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(View)
  },
})
