import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { StepBlockComponent } from './StepBlockComponent'

export interface StepBlockOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    stepBlock: {
      /**
       * Set a step block
       */
      setStepBlock: (attributes: { as?: string; isolated?: boolean }) => ReturnType
    }
  }
}

export const StepBlockExtension = Node.create<StepBlockOptions>({
  name: 'stepBlock',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: '(messageBlock | contentBlock)+',

  group: 'block',

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
      as: {
        default: null,
        parseHTML: element => element.getAttribute('data-as'),
        renderHTML: attributes => {
          if (!attributes.as) {
            return {}
          }
          return {
            'data-as': attributes.as,
          }
        },
      },
      isolated: {
        default: false,
        parseHTML: element => element.getAttribute('data-isolated') === 'true',
        renderHTML: attributes => {
          if (!attributes.isolated) {
            return {}
          }
          return {
            'data-isolated': 'true',
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
        tag: 'div[data-type="step-block"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-type': 'step-block',
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(StepBlockComponent)
  },

  addCommands() {
    return {
      setStepBlock:
        (attributes: { as?: string; isolated?: boolean }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: `step_${Date.now()}`,
              ...attributes,
            },
          })
        },
    }
  },
})
