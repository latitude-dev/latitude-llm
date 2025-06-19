import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ContentImageComponent } from './ContentImageComponent'

export interface ContentImageOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    contentImage: {
      /**
       * Set a content image block
       */
      setContentImage: (content: string) => ReturnType
    }
  }
}

export const ContentImageExtension = Node.create<ContentImageOptions>({
  name: 'contentImage',

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
        tag: 'div[data-type="content-image"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'content-image',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContentImageComponent)
  },

  addCommands() {
    return {
      setContentImage:
        (content: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `image_${Date.now()}`,
              content,
            },
          })
        },
    }
  },
})
