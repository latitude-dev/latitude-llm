import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ContentFileComponent } from './ContentFileComponent'

export interface ContentFileOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    contentFile: {
      /**
       * Set a content file block
       */
      setContentFile: (content: string, name?: string) => ReturnType
    }
  }
}

export const ContentFileExtension = Node.create<ContentFileOptions>({
  name: 'contentFile',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  group: 'block contentBlock',

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-id'),
        renderHTML: attributes => {
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
        parseHTML: element => element.getAttribute('data-content'),
        renderHTML: attributes => ({
          'data-content': attributes.content,
        }),
      },
      name: {
        default: '',
        parseHTML: element => element.getAttribute('data-name'),
        renderHTML: attributes => ({
          'data-name': attributes.name,
        }),
      },
      errors: {
        default: null,
        parseHTML: element => {
          const errors = element.getAttribute('data-errors')
          return errors ? JSON.parse(errors) : null
        },
        renderHTML: attributes => {
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
        tag: 'div[data-type="content-file"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'content-file',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContentFileComponent)
  },

  addCommands() {
    return {
      setContentFile:
        (content: string, name?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `file_${Date.now()}`,
              content,
              name: name || '',
            },
          })
        },
    }
  },
})
