import { AstError } from '@latitude-data/constants/promptl'
import { parse } from 'promptl-ai'
import { describe, expect, it } from 'vitest'
import { fromAstToBlocks } from './fromAstToBlocks'
import {
  CodeBlock,
  FileBlock,
  ImageBlock,
  MessageBlock,
  ParagraphBlock,
  ReferenceLink,
  StepBlock,
} from './types'

describe('astToSimpleBlocks with errors', () => {
  describe('no errors', () => {
    it('should handle prompts without errors', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)
      const root = fromAstToBlocks({ ast, prompt, errors: [] })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeUndefined()
    })

    it('should handle prompts when errors parameter is omitted', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)
      const root = fromAstToBlocks({ ast, prompt, errors: [] })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeUndefined()
    })
  })

  describe('prompt block errors', () => {
    it('should map errors to prompt blocks by start position', () => {
      const prompt = `<prompt location="test" />`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 25,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 26 },
          message: 'Reference tags must have a prompt attribute',
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      // Prompt blocks are now wrapped in paragraphs
      const paragraphBlock = blocks[0] as ParagraphBlock
      expect(paragraphBlock.type).toBe('paragraph')
      const promptBlock = paragraphBlock.children[0] as ReferenceLink
      expect(promptBlock.type).toBe('reference_link')
      expect(promptBlock.errors).toBeDefined()
      expect(promptBlock.errors).toHaveLength(1)
      expect(promptBlock.errors?.[0]?.message).toBe(
        'Reference tags must have a prompt attribute',
      )
      expect(promptBlock.errors?.[0]?.startIndex).toBe(0)
      expect(promptBlock.errors?.[0]?.endIndex).toBe(25)
    })

    it('should handle multiple errors on the same prompt block', () => {
      const prompt = `<prompt location="test" />`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 25,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 26 },
          message: 'Reference tags must have a prompt attribute',
          name: 'CompileError',
        },
        {
          startIndex: 0,
          endIndex: 25,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 26 },
          message: 'Invalid location attribute',
          name: 'ValidationError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const paragraphBlock = blocks[0] as ParagraphBlock
      const promptBlock = paragraphBlock.children[0] as ReferenceLink
      expect(promptBlock.errors).toHaveLength(2)
      expect(promptBlock.errors?.[0]?.message).toBe(
        'Reference tags must have a prompt attribute',
      )
      expect(promptBlock.errors?.[1]?.message).toBe(
        'Invalid location attribute',
      )
    })
  })

  describe('content-file block errors', () => {
    it('should map errors to content-file blocks', () => {
      const prompt = `<content-file>test.pdf</content-file>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 36,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 37 },
          message: 'Content file must have a name attribute',
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const paragraphBlock = blocks[0] as ParagraphBlock
      const fileBlock = paragraphBlock.children[0] as FileBlock
      expect(fileBlock.type).toBe('content_file')
      expect(fileBlock.errors).toBeDefined()
      expect(fileBlock.errors).toHaveLength(1)
      expect(fileBlock.errors?.[0]?.message).toBe(
        'Content file must have a name attribute',
      )
    })
  })

  describe('content-image block errors', () => {
    it('should map errors to content-image blocks', () => {
      const prompt = `<content-image>invalid-url</content-image>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 41,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 42 },
          message: 'Invalid image URL format',
          name: 'ValidationError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const paragraphBlock = blocks[0] as ParagraphBlock
      const imageBlock = paragraphBlock.children[0] as ImageBlock
      expect(imageBlock.type).toBe('content_image')
      expect(imageBlock.errors).toBeDefined()
      expect(imageBlock.errors).toHaveLength(1)
      expect(imageBlock.errors?.[0]?.message).toBe('Invalid image URL format')
    })
  })

  describe('message block errors', () => {
    it('should map errors to message blocks', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 23,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 24 },
          message: 'User message cannot be empty',
          name: 'ValidationError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeDefined()
      expect(userBlock.errors).toHaveLength(1)
      expect(userBlock.errors?.[0]?.message).toBe(
        'User message cannot be empty',
      )
    })
  })

  describe('step block errors', () => {
    it('should map errors to step blocks', () => {
      const prompt = `<step>
<user>Hello</user>
</step>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 30,
          start: { line: 1, column: 1 },
          end: { line: 3, column: 7 },
          message: "Step must have an 'as' attribute",
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const stepBlock = blocks[0] as StepBlock
      expect(stepBlock.type).toBe('step')
      expect(stepBlock.errors).toBeDefined()
      expect(stepBlock.errors).toHaveLength(1)
      expect(stepBlock.errors?.[0]?.message).toBe(
        "Step must have an 'as' attribute",
      )
    })
  })

  describe('nested errors', () => {
    it('should map errors to nested blocks correctly', () => {
      const prompt = `<step as="test">
<user>Please analyze this:
<content-image>invalid-url</content-image>
</user>
</step>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 17, // Position of <user> tag
          endIndex: 94,
          start: { line: 2, column: 1 },
          end: { line: 4, column: 7 },
          message: 'User message validation failed',
          name: 'ValidationError',
        },
        {
          startIndex: 44, // Position of <content-image> tag
          endIndex: 86,
          start: { line: 3, column: 1 },
          end: { line: 3, column: 33 },
          message: 'Invalid image URL',
          name: 'ValidationError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const stepBlock = blocks[0] as StepBlock
      expect(stepBlock.type).toBe('step')
      expect(stepBlock.errors).toBeUndefined() // No error for step itself

      expect(stepBlock.children).toHaveLength(1)
      const userBlock = stepBlock.children[0] as MessageBlock
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeDefined()
      expect(userBlock.errors).toHaveLength(1)
      expect(userBlock.errors?.[0]?.message).toBe(
        'User message validation failed',
      )

      const imageBlock = userBlock.children[1].children[0] as ImageBlock
      expect(imageBlock).toBeDefined()
      expect(imageBlock.errors).toBeDefined()
      expect(imageBlock.errors).toHaveLength(1)
      expect(imageBlock.errors?.[0]?.message).toBe('Invalid image URL')
    })
  })

  describe('mixed content with errors', () => {
    it('should handle mixed content types with various errors', () => {
      const prompt = `<user>
Review this document:
<content-file>document.pdf</content-file>

And this image:
<content-image>https://example.com/image.jpg</content-image>

Then call this tool:
<tool-call name="analyze">{"data": "test"}</tool-call></user>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 29, // Position of content-file (corrected from 23)
          endIndex: 70,
          start: { line: 3, column: 1 },
          end: { line: 3, column: 37 },
          message: 'Content file must have name attribute',
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.type).toBe('message')
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeUndefined()

      const fileBlock = userBlock.children[1].children[0] as FileBlock
      expect(fileBlock).toBeDefined()
      expect(fileBlock.type).toBe('content_file')
      expect(fileBlock.errors).toBeDefined()
      expect(fileBlock.errors).toHaveLength(1)
      expect(fileBlock.errors?.[0]?.message).toBe(
        'Content file must have name attribute',
      )

      const imageBlock = userBlock.children[4].children[0] as ImageBlock
      expect(imageBlock).toBeDefined()
      expect(imageBlock.type).toBe('content_image')
      expect(imageBlock.errors).toBeUndefined() // No error for image

      const toolCallBlock = userBlock.children[7] as CodeBlock
      expect(toolCallBlock).toBeDefined()
      expect(toolCallBlock.type).toBe('code')
      expect(toolCallBlock.errors).toBeDefined()
      expect(toolCallBlock.errors).toHaveLength(0)
    })
  })

  describe('errors without matching AST nodes', () => {
    it('should ignore errors that do not match any AST node start position', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 999, // Position that doesn't exist in AST
          endIndex: 1010,
          start: { line: 10, column: 1 },
          end: { line: 10, column: 12 },
          message: "Some error that doesn't match",
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.role).toBe('user')
      expect(userBlock.errors).toBeUndefined()
    })
  })

  describe('error edge cases', () => {
    it('should handle empty errors array', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)
      const root = fromAstToBlocks({ ast, prompt, errors: [] })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.errors).toBeUndefined()
    })

    it('should handle undefined start position in AST node', () => {
      const prompt = `<user>Hello world</user>`
      const ast = parse(prompt)

      // Simulate AST node without start position
      if (ast.children[0] && 'start' in ast.children[0]) {
        delete (ast.children[0] as any).start
      }

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 23,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 24 },
          message: 'Some error',
          name: 'CompileError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.errors).toBeUndefined() // Should not crash, just ignore error
    })

    it('should preserve error details correctly', () => {
      const prompt = `<prompt path="test" />`
      const ast = parse(prompt)

      const errors: AstError[] = [
        {
          startIndex: 0,
          endIndex: 21,
          start: { line: 1, column: 1 },
          end: { line: 1, column: 22 },
          message: 'Custom error message with special chars: <>&"\'',
          name: 'CustomError',
        },
      ]

      const root = fromAstToBlocks({ ast, prompt, errors })
      const blocks = root.children

      expect(blocks).toHaveLength(1)
      const paragraphBlock = blocks[0] as ParagraphBlock
      const promptBlock = paragraphBlock.children[0] as ReferenceLink
      expect(promptBlock.errors).toBeDefined()
      expect(promptBlock.errors).toHaveLength(1)
      expect(promptBlock.errors?.[0]?.message).toBe(
        'Custom error message with special chars: <>&"\'',
      )
      expect(promptBlock.errors?.[0]?.startIndex).toBe(0)
      expect(promptBlock.errors?.[0]?.endIndex).toBe(21)
    })
  })
})
