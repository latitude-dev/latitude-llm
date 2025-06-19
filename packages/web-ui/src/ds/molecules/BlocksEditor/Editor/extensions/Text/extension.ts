import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TextBlockComponent } from './TextComponent'

export interface TextBlockOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textBlock: {
      /**
       * Set a text block
       */
      setTextBlock: (content: string) => ReturnType
      /**
       * Update text block content
       */
      updateTextBlockContent: (id: string, content: string) => ReturnType
    }
  }
}

export const TextBlockExtension = Node.create<TextBlockOptions>({
  name: 'textBlock',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: 'text*',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {}
          }
          return {
            'data-id': attributes.id,
          }
        },
      },
      content: {
        default: '',
        parseHTML: (element) => element.textContent,
        renderHTML: (attributes) => ({
          'data-content': attributes.content,
        }),
      },
      errors: {
        default: null,
        parseHTML: (element) => {
          const errors = element.getAttribute('data-errors')
          return errors ? JSON.parse(errors) : null
        },
        renderHTML: (attributes) => {
          if (!attributes.errors) {
            return {}
          }
          return {
            'data-errors': JSON.stringify(attributes.errors),
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="text-block"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'text-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TextBlockComponent)
  },

  addCommands() {
    return {
      setTextBlock:
        (content: string) =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name,
              attrs: {
                id: `text_${Date.now()}`,
                content,
              },
              content: content
                ? [
                  {
                    type: 'text',
                    text: content,
                  },
                ]
                : [],
            })
          },
      updateTextBlockContent:
        (id: string, content: string) =>
          ({ tr, state }) => {
            let updated = false
            state.doc.descendants((node, pos) => {
              if (node.type.name === this.name && node.attrs.id === id) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  content,
                })

                // Update the actual text content
                const start = pos + 1
                const end = pos + node.nodeSize - 1
                if (start < end) {
                  tr.delete(start, end)
                }
                if (content) {
                  tr.insert(start, state.schema.text(content))
                }
                updated = true
                return false
              }
            })
            return updated
          },
    }
  },
})

export default TextBlockExtension
