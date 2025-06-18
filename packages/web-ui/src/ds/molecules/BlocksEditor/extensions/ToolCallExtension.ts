import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ToolCallComponent } from './ToolCallComponent'

export interface ToolCallOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toolCall: {
      /**
       * Set a tool call block
       */
      setToolCall: (id?: string, name?: string, parameters?: Record<string, any>) => ReturnType
    }
  }
}

export const ToolCallExtension = Node.create<ToolCallOptions>({
  name: 'toolCall',

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
      toolCallId: {
        default: '',
        parseHTML: element => element.getAttribute('data-tool-call-id'),
        renderHTML: attributes => ({
          'data-tool-call-id': attributes.toolCallId,
        }),
      },
      name: {
        default: '',
        parseHTML: element => element.getAttribute('data-name'),
        renderHTML: attributes => ({
          'data-name': attributes.name,
        }),
      },
      parameters: {
        default: null,
        parseHTML: element => {
          const params = element.getAttribute('data-parameters')
          return params ? JSON.parse(params) : null
        },
        renderHTML: attributes => {
          if (!attributes.parameters) {
            return {}
          }
          return {
            'data-parameters': JSON.stringify(attributes.parameters),
          }
        },
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
        tag: 'div[data-type="tool-call"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'tool-call',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToolCallComponent)
  },

  addCommands() {
    return {
      setToolCall:
        (id?: string, name?: string, parameters?: Record<string, any>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `toolcall_${Date.now()}`,
              toolCallId: id || '',
              name: name || '',
              parameters: parameters || null,
            },
          })
        },
    }
  },
})
