import { Extension } from '@tiptap/core'

export interface BlocksSchemaOptions {
  // Global options for all block types
}

/**
 * Base schema extension that defines the overall structure for blocks
 */
export const BlocksSchema = Extension.create<BlocksSchemaOptions>({
  name: 'blocksSchema',

  addOptions() {
    return {}
  },

  addGlobalAttributes() {
    return [
      {
        types: [
          'textBlock',
          'contentImage', 
          'contentFile',
          'toolCall',
          'promptBlock',
          'messageBlock',
          'stepBlock'
        ],
        attributes: {
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
          errors: {
            default: null,
            parseHTML: element => {
              const errors = element.getAttribute('data-errors')
              return errors ? JSON.parse(errors) : null
            },
            renderHTML: attributes => {
              if (!attributes.errors || !Array.isArray(attributes.errors) || attributes.errors.length === 0) {
                return {}
              }
              return {
                'data-errors': JSON.stringify(attributes.errors),
              }
            },
          },
        },
      },
    ]
  },
})
