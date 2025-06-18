import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MessageBlockComponent } from './MessageBlockComponent'

export interface MessageBlockOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    messageBlock: {
      /**
       * Set a message block
       */
      setMessageBlock: (type: 'system' | 'user' | 'assistant' | 'developer') => ReturnType
    }
  }
}

export const MessageBlockExtension = Node.create<MessageBlockOptions>({
  name: 'messageBlock',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: 'contentBlock+',

  group: 'block messageBlock',

  defining: true,

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
      messageType: {
        default: 'user',
        parseHTML: element => element.getAttribute('data-message-type'),
        renderHTML: attributes => ({
          'data-message-type': attributes.messageType,
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
        tag: 'div[data-type="message-block"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'message-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MessageBlockComponent)
  },

  addCommands() {
    return {
      setMessageBlock:
        (type: 'system' | 'user' | 'assistant' | 'developer') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `message_${Date.now()}`,
              messageType: type,
            },
          })
        },
    }
  },
})
