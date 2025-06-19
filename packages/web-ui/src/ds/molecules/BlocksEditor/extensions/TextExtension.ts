import Text from '@tiptap/extension-text'

/**
 * Text extension for handling text content within blocks
 * This uses the built-in Tiptap Text extension which is required for basic text functionality
 */
export const TextExtension = Text.configure({
  // Use default configuration from Tiptap's built-in Text extension
  // This extension handles inline text content properly within ProseMirror
})
