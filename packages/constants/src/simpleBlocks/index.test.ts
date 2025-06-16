import { describe, it, expect } from 'vitest'
import { parse } from 'promptl-ai'
import { astToSimpleBlocks } from './astToSimpleBlocks'
import { simpleBlocksToText } from './simpleBlocksToText'
import {
  StepBlock,
  MessageBlock,
  AnyBlock,
  PromptBlock,
  TextBlock,
  ImageBlock,
  FileBlock,
  ToolCallBlock,
} from './types'

describe('astToSimpleBlocks', () => {
  it('should convert plain text to simple blocks', () => {
    const prompt = 'This is a simple text prompt.'
    const ast = parse(prompt)
    const blocks = astToSimpleBlocks({ ast, prompt })
    const output = simpleBlocksToText(blocks)

    expect(blocks).toHaveLength(1)
    const textBlock = blocks[0] as TextBlock
    expect(textBlock.type).toBe('text')
    expect(textBlock.content).toBe(prompt)
    expect(output.trim()).toBe(prompt.trim())
  })

  describe('content-image blocks', () => {
    it('should handle top-level content-image blocks', () => {
      const prompt = `<system>
You are an image analysis assistant.
</system>

<content-image>
https://example.com/image.jpg
</content-image>

<user>
What do you see in this image?
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      // Normalize whitespace for comparison
      const normalizedInput = prompt.trim()
      const normalizedOutput = output.trim()

      expect(normalizedOutput).toBe(normalizedInput)

      expect(blocks).toHaveLength(5) // system, whitespace, content-image, whitespace, user
      expect(blocks[0]?.type).toBe('system')
      expect(blocks[1]?.type).toBe('text') // whitespace between blocks
      expect(blocks[2]?.type).toBe('content-image')
      const imageBlock = blocks[2] as ImageBlock
      expect(imageBlock.content.trim()).toBe('https://example.com/image.jpg')
      expect(blocks[3]?.type).toBe('text') // whitespace between blocks
      expect(blocks[4]?.type).toBe('user')
    })

    it('should handle multiple content-image blocks', () => {
      const prompt = `<content-image>
https://example.com/image1.jpg
</content-image>

<content-image>
https://example.com/image2.jpg
</content-image>

<user>
Compare these two images.
</user>`

      const ast = parse(prompt)

      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(prompt.trim())

      const imageBlocks = blocks.filter(
        (block) => block.type === 'content-image',
      ) as ImageBlock[]

      expect(imageBlocks).toHaveLength(2)
      expect(imageBlocks[0]?.content.trim()).toBe(
        'https://example.com/image1.jpg',
      )
      expect(imageBlocks[1]?.content.trim()).toBe(
        'https://example.com/image2.jpg',
      )
    })

    it('should handle content-image with data URLs', () => {
      const prompt = `<content-image>
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...
</content-image>`

      const ast = parse(prompt)

      const blocks = astToSimpleBlocks({ ast, prompt })
      const imageBlock = blocks[0] as ImageBlock
      expect(imageBlock.type).toBe('content-image')
      expect(imageBlock.content.trim()).toBe(
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...',
      )

      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(prompt.trim())
    })
  })

  describe('content-image blocks in steps', () => {
    it('should handle content-image blocks within steps', () => {
      const prompt = `<step as="analysis">
First, examine this image:

<content-image>
https://example.com/main.jpg
</content-image>

Then compare with this reference:

<content-image>
https://example.com/reference.jpg
</content-image>

Provide your analysis.
</step>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      expect(blocks).toHaveLength(1)
      const stepBlock = blocks[0] as StepBlock
      expect(stepBlock.type).toBe('step')
      expect(stepBlock.attributes?.as).toBe('analysis')
      const children = stepBlock.children || []
      expect(children.length).toBeGreaterThan(0)

      const imageChildren = children.filter(
        (child) => child.type === 'content-image',
      )
      expect(imageChildren).toHaveLength(2)
      expect(imageChildren[0]?.content.trim()).toBe(
        'https://example.com/main.jpg',
      )
      expect(imageChildren[1]?.content.trim()).toBe(
        'https://example.com/reference.jpg',
      )

      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle mixed content with images in steps', () => {
      const prompt = `<step as="preparation" isolated>
Review the document:

<content-image>
https://example.com/document.png
</content-image>

Analyze the chart:

<content-image>
https://example.com/chart.jpg
</content-image>

Consider the implications.
</step>`

      const ast = parse(prompt)

      const blocks = astToSimpleBlocks({ ast, prompt })
      const stepBlock = blocks[0] as StepBlock

      expect(stepBlock.attributes?.as).toBe('preparation')
      expect(stepBlock.attributes?.isolated).toBe(true)

      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(prompt.trim())
    })
  })

  describe('complex scenarios with content-image', () => {
    it('should handle full conversation with mixed content', () => {
      const prompt = `<system>
You are a multimodal assistant.
</system>

<user>
Here are my vacation photos:
</user>

<content-image>
https://vacation.com/beach.jpg
</content-image>

<content-image>
https://vacation.com/sunset.jpg
</content-image>

<step as="analysis">
Analyze each photo for:

<content-image>
https://reference.com/ideal-beach.jpg
</content-image>

Compare with this ideal reference.
</step>

<assistant>
Based on my analysis: {{analysis}}
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(11) // system, ws, user, ws, content-image, ws, content-image, ws, step, ws, assistant

      const topLevelImages = blocks.filter(
        (block) => block.type === 'content-image',
      )
      expect(topLevelImages).toHaveLength(2)

      // Check content-image block within step
      const stepBlock = blocks.find((block) => block.type === 'step')
      const stepImages =
        stepBlock?.children?.filter(
          (child) => child.type === 'content-image',
        ) || []
      expect(stepImages).toHaveLength(1)
    })

    it('should preserve content-image blocks with mustache expressions', () => {
      const prompt = `<content-image>
{{imageUrl}}
</content-image>

<step as="dynamic">
Process this dynamic image:

<content-image>
{{images[0]}}
</content-image>

And compare with:

<content-image>
{{referenceImage}}
</content-image>
</step>`

      const ast = parse(prompt)

      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      const imageBlock = blocks[0] as ImageBlock
      expect(imageBlock.content.trim()).toBe('{{imageUrl}}')

      const stepBlock = blocks[2] as StepBlock // blocks[1] is whitespace, blocks[2] is step
      const stepChildren = stepBlock.children || []
      const stepImages = stepChildren.filter(
        (child) => child.type === 'content-image',
      )
      expect(stepImages[0]?.content.trim()).toBe('{{images[0]}}')
      expect(stepImages[1]?.content.trim()).toBe('{{referenceImage}}')
    })
  })

  describe('edge cases with content-image', () => {
    it('should handle empty content-image blocks', () => {
      const prompt = `<content-image></content-image>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe('<content-image />')
      const imageBlock = blocks[0] as ImageBlock
      expect(imageBlock.type).toBe('content-image')
      expect(imageBlock.content.trim()).toBe('')
    })

    it('should handle self-closing content-image blocks', () => {
      const prompt = `<content-image />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())
      expect(blocks[0]?.type).toBe('content-image')
    })

    it('should handle content-image with whitespace variations', () => {
      const prompt = `<content-image>

https://example.com/image.jpg

</content-image>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())
      const imageBlock = blocks[0] as ImageBlock
      expect(imageBlock.content).toContain('https://example.com/image.jpg')
    })
  })

  describe('round-trip consistency', () => {
    const testCases = [
      {
        name: 'simple content-image',
        input: `<content-image>https://example.com/test.jpg</content-image>`,
      },
      {
        name: 'multiple content-images',
        input: `<content-image>image1.jpg</content-image>

<content-image>image2.jpg</content-image>`,
      },
      {
        name: 'content-image in conversation',
        input: `<system>System prompt</system>

<user>User message</user>

<content-image>user-image.jpg</content-image>

<assistant>Response</assistant>`,
      },
      {
        name: 'content-image in step',
        input: `<step as="test">
Text before

<content-image>step-image.jpg</content-image>

Text after
</step>`,
      },
      {
        name: 'simple content-file',
        input: `<content-file name="test.pdf">/path/to/test.pdf</content-file>`,
      },
      {
        name: 'simple tool-call',
        input: `<tool-call id="call_1" name="test_tool" param="value" />`,
      },
      {
        name: 'content-file in conversation',
        input: `<user>Please review this document</user>

<content-file name="report.pdf">/uploads/report.pdf</content-file>

<assistant>I'll review the document</assistant>`,
      },
      {
        name: 'tool-call in conversation',
        input: `<assistant>I'll search for that information</assistant>

<tool-call id="search_1" name="web_search" query="AI trends 2024" />`,
      },
      {
        name: 'mixed content types',
        input: `<user>Analyze this image and document</user>

<content-image>chart.png</content-image>

<content-file name="data.csv">data.csv</content-file>

<tool-call id="analyze_1" name="analyze_data" image="chart.png" data="data.csv" />`,
      },
    ]

    testCases.forEach(({ name, input }) => {
      it(`should maintain round-trip consistency for ${name}`, () => {
        const prompt = input.trim()
        const ast = parse(prompt)
        const blocks = astToSimpleBlocks({ ast, prompt })
        const output = simpleBlocksToText(blocks)

        expect(output.trim()).toBe(input.trim())
      })
    })
  })

  describe('content blocks inside message blocks', () => {
    it('should handle content-image inside assistant block', () => {
      const prompt = `<assistant>
Here is the image about the cat you requested:
<content-image>https://google.com/img/cat.jpg</content-image>
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(1)
      const assistantBlock = blocks[0] as MessageBlock
      expect(assistantBlock?.type).toBe('assistant')
      expect(assistantBlock?.children).toBeDefined()
      expect(assistantBlock?.children?.length).toBeGreaterThan(0)

      const contentImageChild = assistantBlock?.children?.find(
        (child) => child.type === 'content-image',
      )
      expect(contentImageChild).toBeDefined()
      expect(contentImageChild?.content.trim()).toBe(
        'https://google.com/img/cat.jpg',
      )
    })

    it('should handle text before and after content-image in message block', () => {
      const prompt = `<user>
Please analyze this image:

<content-image>https://example.com/analysis.jpg</content-image>

What do you see?
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock?.type).toBe('user')
      expect(userBlock?.children).toBeDefined()
      expect(userBlock?.children?.length).toBeGreaterThan(0)

      const textChildren = userBlock?.children?.filter(
        (child) => child.type === 'text',
      )
      const imageChildren = userBlock?.children?.filter(
        (child) => child.type === 'content-image',
      )

      expect(textChildren?.length).toBeGreaterThan(0)
      expect(imageChildren?.length).toBe(1)
    })

    it('should handle multiple content blocks in a single message', () => {
      const prompt = `<system>
You are an image analysis assistant.

<content-image>https://example.com/reference.jpg</content-image>

Use this as a reference for comparison.

<content-image>https://example.com/guidelines.pdf</content-image>

Follow these guidelines.
</system>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(1)
      const systemBlock = blocks[0] as MessageBlock
      expect(systemBlock?.type).toBe('system')

      const imageChildren = systemBlock?.children?.filter(
        (child) => child.type === 'content-image',
      )
      expect(imageChildren?.length).toBe(2)
    })

    it('should handle empty content-image inside message block', () => {
      const prompt = `<assistant>
Here's an empty image placeholder:
<content-image></content-image>
Please provide an image.
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      // The empty content-image should become self-closing
      const expected = `<assistant>
Here's an empty image placeholder:
<content-image />
Please provide an image.
</assistant>`

      expect(output.trim()).toBe(expected.trim())
    })

    it('should handle only content-image in message block (no text)', () => {
      const prompt = `<user>
<content-image>https://example.com/only-image.jpg</content-image>
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock?.children?.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('message blocks with content tags', () => {
    it('should handle assistant message with content-image block', () => {
      const prompt = `<assistant>
Here is the image about the cat you requested:
<content-image>https://google.com/img/cat.jpg</content-image>
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      expect(blocks).toHaveLength(1)
      const assistantBlock = blocks[0] as MessageBlock
      expect(assistantBlock.type).toBe('assistant')
      expect(assistantBlock.children).toHaveLength(3)
      const textBlock = assistantBlock.children[0] as TextBlock
      expect(textBlock.type).toBe('text')
      expect(textBlock.content).toContain(
        'Here is the image about the cat you requested:',
      )
      const imageBlock = assistantBlock.children[1] as ImageBlock
      expect(imageBlock.type).toBe('content-image')
      expect(imageBlock.content.trim()).toBe('https://google.com/img/cat.jpg')
      expect(assistantBlock.children[2]?.type).toBe('text')
    })

    it('should handle user message with content before and after content-image', () => {
      const prompt = `<user>
Please analyze this image:

<content-image>https://example.com/analysis.jpg</content-image>

What do you see in it?
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.type).toBe('user')
      expect(userBlock.children).toHaveLength(3)
      const textBlock = userBlock.children[0] as TextBlock
      expect(textBlock.type).toBe('text')
      expect(textBlock.content).toContain('Please analyze this image:')
      const imageBlock = userBlock.children[1] as ImageBlock
      expect(imageBlock.type).toBe('content-image')
      expect(imageBlock.content.trim()).toBe('https://example.com/analysis.jpg')
      const textBlock2 = userBlock.children[2] as TextBlock
      expect(textBlock2.type).toBe('text')
      expect(textBlock2.content).toContain('What do you see in it?')
    })

    it('should handle multiple content-image blocks in assistant message', () => {
      const prompt = `<assistant>
Here are the images you requested:

<content-image>https://example.com/image1.jpg</content-image>

And here's another one:

<content-image>https://example.com/image2.jpg</content-image>

Hope these help!
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      const assistantBlock = blocks[0] as MessageBlock
      expect(assistantBlock.type).toBe('assistant')
      expect(assistantBlock.children).toHaveLength(5)

      const imageBlocks = assistantBlock.children.filter(
        (child) => child.type === 'content-image',
      )
      expect(imageBlocks).toHaveLength(2)
      expect(imageBlocks[0]?.content.trim()).toBe(
        'https://example.com/image1.jpg',
      )
      expect(imageBlocks[1]?.content.trim()).toBe(
        'https://example.com/image2.jpg',
      )
    })

    it('should handle empty content-image in message blocks', () => {
      const prompt = `<assistant>
Here's an empty image tag:
<content-image></content-image>
Done.
</assistant>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      // The output should normalize empty content-image to self-closing
      expect(output.trim()).toBe(`<assistant>
Here's an empty image tag:
<content-image />
Done.
</assistant>`)

      const assistantBlock = blocks[0] as MessageBlock
      const imageBlock = assistantBlock.children[1] as ImageBlock
      expect(imageBlock.type).toBe('content-image')
      expect(imageBlock.content).toBe('')
    })

    it('should handle system message with content tags', () => {
      const prompt = `<system>
You are an AI assistant. Here's a reference image:
<content-image>https://example.com/reference.jpg</content-image>
Use this as context for your responses.
</system>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())

      const systemBlock = blocks[0] as MessageBlock
      expect(systemBlock.type).toBe('system')
      expect(systemBlock.children).toHaveLength(3)
      expect(systemBlock.children[1]?.type).toBe('content-image')
    })
  })

  describe('ID uniqueness', () => {
    it('should generate unique IDs for all blocks in complex prompt', () => {
      const prompt = `---
provider: OpenAI
model: gpt-4o-mini
tools:
  - latitude/code
---
Say hi to {{ name }}




<user>
  Hola
  {{if thing }}
    Do this
  {{ endif }}
  <prompt path="use-mo1" location={{thing}} />
</user>

<user>
  <content-image>https://t4.ftcdn.net/jpg/02/66/72/41/360_F_266724172_Iy8gdKgMa7XmrhYYxLCxyhx6J7070Pr8.jpg</content-image>
</user>

<step isolated as="cosa">
  I'm a pre user text
  <user>This is me asking</user>
  <assistant>
    This is you responding





  </assistant>
</step>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      // Collect all IDs from all blocks and their children recursively
      function collectAllIds(blocks: AnyBlock[]): string[] {
        const ids: string[] = []

        function collectFromBlock(block: AnyBlock) {
          ids.push(block.id)
          if ('children' in block && block.children) {
            block.children.forEach(collectFromBlock)
          }
        }

        blocks.forEach(collectFromBlock)
        return ids
      }

      const allIds = collectAllIds(blocks)
      const uniqueIds = [...new Set(allIds)]

      expect(allIds.length).toBe(uniqueIds.length)
      expect(allIds.length).toBe(uniqueIds.length)
    })
  })

  describe('prompt blocks', () => {
    it('should handle prompt block with path and attributes', () => {
      const prompt = `<user>
  Here you can find your guidelines for the city
  <prompt path="./guidelines/cities" location={{city}} />
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.type).toBe('user')

      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.children).toHaveLength(3) // text, prompt, trailing newline

      const textBlock = userBlock.children[0] as TextBlock
      expect(textBlock.type).toBe('text')
      expect(textBlock.content).toContain(
        'Here you can find your guidelines for the city',
      )

      const promptBlock = userBlock.children[1] as PromptBlock
      expect(promptBlock?.type).toBe('prompt')
      expect(promptBlock.attributes.path).toBe('./guidelines/cities')
      expect(promptBlock.attributes.location).toBe('{{city}}')
    })

    it('should handle prompt block with static attributes', () => {
      const prompt = `<user>
  <prompt path="./guidelines/cities" location="Barcelona" />
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.type).toBe('user')

      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.children).toHaveLength(3) // leading whitespace, prompt, trailing newline

      const leadingTextBlock = userBlock.children[0] as TextBlock
      expect(leadingTextBlock?.type).toBe('text')
      expect(leadingTextBlock?.content).toBe('\n  ')

      const promptBlock = userBlock.children[1] as PromptBlock
      expect(promptBlock?.type).toBe('prompt')
      expect(promptBlock.attributes.path).toBe('./guidelines/cities')
      expect(promptBlock.attributes.location).toBe('Barcelona')

      const trailingTextBlock = userBlock.children[2] as TextBlock
      expect(trailingTextBlock?.type).toBe('text')
      expect(trailingTextBlock?.content).toBe('\n')
    })

    it('should handle prompt block at root level', () => {
      const prompt = `<prompt path="./shared/intro" />

Some text here`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      expect(blocks).toHaveLength(2)

      const promptBlock = blocks[0]
      expect(promptBlock?.type).toBe('prompt')
      if (promptBlock?.type === 'prompt') {
        expect(promptBlock.attributes.path).toBe('./shared/intro')
      }

      const textBlock = blocks[1] as TextBlock
      expect(textBlock?.type).toBe('text')
      expect(textBlock.content).toContain('Some text here')
    })

    it('should handle prompt block inside step', () => {
      const prompt = `<step as="planning">
  <prompt path="./planning/template" project={{projectName}} />
  Additional planning content
</step>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })

      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.type).toBe('step')

      const stepBlock = blocks[0]
      if (stepBlock?.type === 'step') {
        expect(stepBlock.children).toHaveLength(3) // leading whitespace, prompt, text with additional content

        const leadingTextBlock = stepBlock.children?.[0]
        expect(leadingTextBlock?.type).toBe('text')
        if (leadingTextBlock?.type === 'text') {
          expect(leadingTextBlock.content).toBe('\n  ')
        }

        const promptBlock = stepBlock.children?.[1]
        expect(promptBlock?.type).toBe('prompt')
        if (promptBlock?.type === 'prompt') {
          expect(promptBlock.attributes.path).toBe('./planning/template')
          expect(promptBlock.attributes.project).toBe('{{projectName}}')
        }

        const textBlock = stepBlock.children?.[2]
        expect(textBlock?.type).toBe('text')
        if (textBlock?.type === 'text') {
          expect(textBlock.content).toContain('Additional planning content')
        }
      }
    })

    it('should maintain round-trip consistency for prompt blocks', () => {
      const prompt = `<user>
  Guidelines: <prompt path="./guidelines/cities" location={{city}} />

  Or default: <prompt path="./guidelines/cities" location="Barcelona" />
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      // Parse the output again to ensure it's valid
      const roundTripAst = parse(output.trim())
      const roundTripBlocks = astToSimpleBlocks({
        ast: roundTripAst,
        prompt: output.trim(),
      })

      expect(roundTripBlocks).toHaveLength(blocks.length)
      expect(roundTripBlocks[0]?.type).toBe('user')

      const userBlock = roundTripBlocks[0]
      if (userBlock?.type === 'user') {
        expect(userBlock.children).toHaveLength(5) // text, prompt, text, prompt, text
      }
    })
  })

  describe('content-file blocks', () => {
    it('should handle top-level content-file blocks', () => {
      const prompt = `<content-file name="document.pdf">
/path/to/document.pdf
</content-file>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(1)
      const fileBlock = blocks[0] as FileBlock
      expect(fileBlock.type).toBe('content-file')
      expect(fileBlock.content.trim()).toBe('/path/to/document.pdf')
      expect(fileBlock.attributes?.name).toBe('document.pdf')
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle multiple content-file blocks', () => {
      const prompt = `<content-file name="doc1.pdf">
/path/to/doc1.pdf
</content-file>

<content-file name="doc2.docx">
/path/to/doc2.docx
</content-file>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(3) // 2 file blocks + 1 text block for whitespace
      const fileBlock1 = blocks[0] as FileBlock
      const fileBlock2 = blocks[2] as FileBlock

      expect(fileBlock1.type).toBe('content-file')
      expect(fileBlock1.attributes?.name).toBe('doc1.pdf')
      expect(fileBlock2.type).toBe('content-file')
      expect(fileBlock2.attributes?.name).toBe('doc2.docx')
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle content-file without name attribute', () => {
      const prompt = `<content-file>
/path/to/unnamed.pdf
</content-file>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const fileBlock = blocks[0] as FileBlock

      expect(fileBlock.type).toBe('content-file')
      expect(fileBlock.attributes?.name).toBe('') // Should default to empty string
    })

    it('should handle empty content-file blocks', () => {
      const prompt = `<content-file name="empty.txt"></content-file>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe('<content-file name="empty.txt" />')
      const fileBlock = blocks[0] as FileBlock
      expect(fileBlock.type).toBe('content-file')
      expect(fileBlock.content.trim()).toBe('')
    })

    it('should handle self-closing content-file blocks', () => {
      const prompt = `<content-file name="test.pdf" />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())
      expect(blocks[0]?.type).toBe('content-file')
    })
  })

  describe('tool-call blocks', () => {
    it('should handle top-level tool-call blocks', () => {
      const prompt = `<tool-call id="call_123" name="get_weather" location="New York" unit="celsius" />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(1)
      const toolCallBlock = blocks[0] as ToolCallBlock
      expect(toolCallBlock.type).toBe('tool-call')
      expect(toolCallBlock.attributes?.id).toBe('call_123')
      expect(toolCallBlock.attributes?.name).toBe('get_weather')
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle multiple tool-call blocks', () => {
      const prompt = `<tool-call id="call_1" name="search" query="AI" />

<tool-call id="call_2" name="calculate" expression="2+2" />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(3) // 2 tool-call blocks + 1 text block for whitespace
      const toolCall1 = blocks[0] as ToolCallBlock
      const toolCall2 = blocks[2] as ToolCallBlock

      expect(toolCall1.type).toBe('tool-call')
      expect(toolCall1.attributes?.id).toBe('call_1')
      expect(toolCall1.attributes?.name).toBe('search')
      expect(toolCall2.type).toBe('tool-call')
      expect(toolCall2.attributes?.id).toBe('call_2')
      expect(toolCall2.attributes?.name).toBe('calculate')
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle tool-call without attributes', () => {
      const prompt = `<tool-call>
{"action": "test"}
</tool-call>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const toolCallBlock = blocks[0] as ToolCallBlock

      expect(toolCallBlock.type).toBe('tool-call')
      expect(toolCallBlock.attributes?.id).toBe('') // Should default to empty string
      expect(toolCallBlock.attributes?.name).toBe('') // Should default to empty string
    })

    it('should handle empty tool-call blocks', () => {
      const prompt = `<tool-call id="empty" name="noop"></tool-call>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe('<tool-call id="empty" name="noop" />')
      const toolCallBlock = blocks[0] as ToolCallBlock
      expect(toolCallBlock.type).toBe('tool-call')
    })

    it('should handle self-closing tool-call blocks', () => {
      const prompt = `<tool-call id="test" name="ping" />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(output.trim()).toBe(prompt.trim())
      expect(blocks[0]?.type).toBe('tool-call')
    })

    it('should handle tool-call with additional parameters', () => {
      const prompt = `<tool-call id="search_1" name="web_search" timeout="30" retry="true" query="AI trends 2024" limit="10" />`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const toolCallBlock = blocks[0] as ToolCallBlock

      expect(toolCallBlock.type).toBe('tool-call')
      expect(toolCallBlock.attributes?.id).toBe('search_1')
      expect(toolCallBlock.attributes?.name).toBe('web_search')
      expect(toolCallBlock.attributes?.parameters?.timeout).toBe('30')
      expect(toolCallBlock.attributes?.parameters?.retry).toBe('true')

      // The output should only include id and name attributes, not parameters
      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(
        `<tool-call id="search_1" name="web_search" timeout="30" retry="true" query="AI trends 2024" limit="10" />`,
      )
    })

    it('should separate parameters from core attributes in tool-call', () => {
      const prompt = `<tool-call id="calc_1" name="calculator" precision="high" async="false" debug="true" />`
      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const toolCallBlock = blocks[0] as ToolCallBlock

      // Core attributes
      expect(toolCallBlock.attributes?.id).toBe('calc_1')
      expect(toolCallBlock.attributes?.name).toBe('calculator')

      // Additional parameters
      expect(toolCallBlock.attributes?.parameters?.precision).toBe('high')
      expect(toolCallBlock.attributes?.parameters?.async).toBe('false')
      expect(toolCallBlock.attributes?.parameters?.debug).toBe('true')

      // Round-trip should only preserve core attributes
      const output = simpleBlocksToText(blocks)
      expect(output.trim()).toBe(
        `<tool-call id="calc_1" name="calculator" precision="high" async="false" debug="true" />`,
      )
    })
  })

  describe('content-file and tool-call in steps', () => {
    it('should handle content-file blocks in steps', () => {
      const prompt = `<step as="document_review">
Please review this document:

<content-file name="report.pdf">
/uploads/report.pdf
</content-file>

Provide feedback.
</step>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(1)
      const stepBlock = blocks[0] as StepBlock
      expect(stepBlock.type).toBe('step')
      expect(stepBlock.attributes?.as).toBe('document_review')

      const fileChild = stepBlock.children?.find(
        (child) => child.type === 'content-file',
      ) as FileBlock
      expect(fileChild).toBeDefined()
      expect(fileChild.attributes?.name).toBe('report.pdf')
      expect(output.trim()).toBe(prompt.trim())
    })

    it('should handle tool-call blocks in steps', () => {
      const prompt = `<step as="api_call">
Making API call:

<tool-call id="weather_1" name="get_weather" city="London" />

Processing response.
</step>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(1)
      const stepBlock = blocks[0] as StepBlock
      expect(stepBlock.type).toBe('step')

      const toolCallChild = stepBlock.children?.find(
        (child) => child.type === 'tool-call',
      ) as ToolCallBlock
      expect(toolCallChild).toBeDefined()
      expect(toolCallChild.attributes?.id).toBe('weather_1')
      expect(toolCallChild.attributes?.name).toBe('get_weather')
      expect(output.trim()).toBe(prompt.trim())
    })
  })

  describe('mixed content blocks', () => {
    it('should handle content-image, content-file, and tool-call together', () => {
      const prompt = `<user>
Here's an image:
<content-image>https://example.com/image.jpg</content-image>

And a document:
<content-file name="data.csv">/path/to/data.csv</content-file>

Please analyze both and call this tool:
<tool-call id="analyze_1" name="analyze_data" image_url="https://example.com/image.jpg" data_file="/path/to/data.csv" />
</user>`

      const ast = parse(prompt)
      const blocks = astToSimpleBlocks({ ast, prompt })
      const output = simpleBlocksToText(blocks)

      expect(blocks).toHaveLength(1)
      const userBlock = blocks[0] as MessageBlock
      expect(userBlock.type).toBe('user')

      const imageChild = userBlock.children?.find(
        (child) => child.type === 'content-image',
      )
      const fileChild = userBlock.children?.find(
        (child) => child.type === 'content-file',
      ) as FileBlock
      const toolCallChild = userBlock.children?.find(
        (child) => child.type === 'tool-call',
      ) as ToolCallBlock

      expect(imageChild).toBeDefined()
      expect(fileChild).toBeDefined()
      expect(fileChild.attributes?.name).toBe('data.csv')
      expect(toolCallChild).toBeDefined()
      expect(toolCallChild.attributes?.id).toBe('analyze_1')
      expect(toolCallChild.attributes?.name).toBe('analyze_data')

      expect(output.trim()).toBe(prompt.trim())
    })
  })
})
