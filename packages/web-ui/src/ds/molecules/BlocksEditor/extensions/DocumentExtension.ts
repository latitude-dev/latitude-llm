import { Node } from '@tiptap/core'

/**
 * Custom Document extension for our blocks editor
 * This serves as the root node that can contain our block types
 */
export const DocumentExtension = Node.create({
  name: 'doc',
  
  topNode: true,
  
  content: 'block+',
  
  parseHTML() {
    return [
      { tag: 'div[data-type="blocks-document"]' },
    ]
  },
  
  renderHTML() {
    return ['div', { 'data-type': 'blocks-document' }, 0]
  },
})
