import type { AstError } from '@latitude-data/constants/promptl'
import { parse, scan } from 'promptl-ai'
import { describe, expect, it } from 'vitest'
import { fromAstToBlocks } from './fromAstToBlocks'
import { fromBlocksToText } from './fromBlocksToText'
import type { StepBlock, TextBlock } from './types'

describe('fromAstToBlocks', () => {
  it('should convert plain text to simple blocks', () => {
    const prompt = 'This is a simple text prompt.'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty prompt', () => {
    const prompt = ''
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle leading and trailing whitespaces', () => {
    const prompt = `

    


    yeeet


pong




`
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt.trim())
  })

  it('should handle indentations and newlines', () => {
    const prompt = `


  This is an outside system message

<step>
  <system>This is a system message</system>

<user>
  This is a user message
</user>

  This is a list:
      - This is a list item
    - This is a list item
  - This is a list item

<system>This is an inline system message</system>
</step>


This is an outside system message
<step>This is another step</step>



`

    const expectedPrompt = `
This is an outside system message

<step>
  <system>
    This is a system message
  </system>

  <user>
    This is a user message
  </user>

  This is a list:
      - This is a list item
    - This is a list item
  - This is a list item

  <system>
    This is an inline system message
  </system>
</step>


This is an outside system message
<step>
  This is another step
</step>
`.trimStart()

    const expectedBlocks = [
      expect.objectContaining({
        type: 'paragraph',
        children: [
          expect.objectContaining({
            type: 'text',
            text: 'This is an outside system message',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'paragraph',
        children: [
          expect.objectContaining({
            type: 'text',
            text: '',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'step',
        children: [
          expect.objectContaining({
            type: 'message',
            role: 'system',
            children: [
              expect.objectContaining({
                type: 'paragraph',
                children: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'This is a system message',
                  }),
                ],
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'message',
            role: 'user',
            children: [
              expect.objectContaining({
                type: 'paragraph',
                children: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'This is a user message',
                  }),
                ],
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: 'This is a list:',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '    - This is a list item',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '  - This is a list item',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '- This is a list item',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: '',
              }),
            ],
          }),
          expect.objectContaining({
            type: 'message',
            role: 'system',
            children: [
              expect.objectContaining({
                type: 'paragraph',
                children: [
                  expect.objectContaining({
                    type: 'text',
                    text: 'This is an inline system message',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      expect.objectContaining({
        type: 'paragraph',
        children: [
          expect.objectContaining({
            type: 'text',
            text: '',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'paragraph',
        children: [
          expect.objectContaining({
            type: 'text',
            text: '',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'paragraph',
        children: [
          expect.objectContaining({
            type: 'text',
            text: 'This is an outside system message',
          }),
        ],
      }),
      expect.objectContaining({
        type: 'step',
        children: [
          expect.objectContaining({
            type: 'paragraph',
            children: [
              expect.objectContaining({
                type: 'text',
                text: 'This is another step',
              }),
            ],
          }),
        ],
      }),
    ]

    // Note: testing idempotency

    let ast = parse(prompt)
    let rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children).toEqual(expectedBlocks)
    let output = fromBlocksToText(rootNode)
    expect(output).toBe(expectedPrompt)

    ast = parse(output)
    rootNode = fromAstToBlocks({ ast, prompt: output })
    expect(rootNode.children).toEqual(expectedBlocks)
    output = fromBlocksToText(rootNode)
    expect(output).toBe(expectedPrompt)

    ast = parse(output)
    rootNode = fromAstToBlocks({ ast, prompt: output })
    expect(rootNode.children).toEqual(expectedBlocks)
    output = fromBlocksToText(rootNode)
    expect(output).toBe(expectedPrompt)
  })

  it('should handle escaped tags', () => {
    const prompt = `
<\\step>
  Escaped step
</\\step>
<\\message>
  Escaped message
<\\/message>
<\\tag>
  Escaped tag
<\\/tag>
`.trim()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '<\\step>' })],
        }),
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '</\\step>' })],
        }),
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '<\\message>' })],
        }),
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '<\\/message>' })],
        }),
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '<\\tag>' })],
        }),
        expect.objectContaining({
          type: 'paragraph',
          children: [expect.objectContaining({ type: 'text', text: '<\\/tag>' })],
        }),
      ]),
    )

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle top-level content-image blocks', () => {
    const prompt = `
<system>
  You are an image analysis assistant.
</system>

<content-image>
https://example.com/image.jpg
</content-image>

<user>
  What do you see in this image?
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('handle if block', () => {
    const prompt = `
You are an image analysis assistant.
{{ if foo == "Bar" }}
  I can not be rendered in Lexical
{{ endif }}
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('add an empty paragraph to a message', () => {
    const prompt = `
<user>

</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children[0]!.children).toEqual([
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            type: 'text',
            text: '',
          },
        ],
      },
    ])

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('add an empty paragraph to an empty step', () => {
    const prompt = `
<step>

</step>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children[0]!.children).toEqual([
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            type: 'text',
            text: '',
          },
        ],
      },
    ])

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('handle errors', async () => {
    const prompt = `
You are an image analysis assistant.

{{ if foo == "Bar" }
  I can not be rendered in Lexical
{{ endif }}

How are you?
`.trim()

    const metadata = await scan({ prompt })
    const rootNode = fromAstToBlocks({
      ast: metadata.ast,
      errors: metadata.errors as AstError[],
      prompt,
    })

    const codeBlock = rootNode.children.find((n) => n.type === 'code')!
    expect(codeBlock.errors).toEqual([
      {
        start: {
          line: 3,
          column: 19,
          character: 56,
        },
        end: {
          line: 7,
          column: 13,
          character: 119,
        },
        name: 'ParseError',
        message: "Expected '}}' but did not find it.",
        startIndex: 56,
        endIndex: 119,
      },
    ])
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('handle for loop block', () => {
    const prompt = `
You are an image analysis assistant.
{{ for item, index in list }}
  {{ index }}: {{ item }}
{{ endfor }}
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple content-image blocks', () => {
    const prompt = `
<content-image>
https://example.com/image1.jpg
</content-image>

<content-image>
https://example.com/image2.jpg
</content-image>

<user>
  Compare these two images.
</user>
`.trimStart()

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('filters config', () => {
    const prompt = `
---
provider: OpenAI
model: gpt-4o-mini
---
I'm a simple prompt
`.trim()

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe("I'm a simple prompt")
  })

  it('should handle content-image with data URLs', () => {
    const prompt = `
<content-image>
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...
</content-image>
`.trim()

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image blocks within steps', () => {
    const prompt = `
<step as="analysis">
  First, examine this image:

  <content-image>https://example.com/main.jpg</content-image>

  Then compare with this reference:

  <content-image>https://example.com/reference.jpg</content-image>

  Provide your analysis.
</step>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle mixed content with images in steps', () => {
    const prompt = `
<step as="preparation" isolated>
  Review the document:

  <content-image>https://example.com/document.png</content-image>

  Analyze the chart:

  <content-image>https://example.com/chart.jpg</content-image>

  Consider the implications.
</step>
`.trimStart()

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle full conversation with mixed content', () => {
    const prompt = `
<system>
  You are a multimodal assistant.
</system>

<user>
  Here are my vacation photos:
</user>

<content-image>https://vacation.com/beach.jpg</content-image>

<content-image>https://vacation.com/sunset.jpg</content-image>

<step as="analysis">
  Analyze each photo for:

  <content-image>https://reference.com/ideal-beach.jpg</content-image>

  Compare with this ideal reference.
</step>

<assistant>
  Based on my analysis: {{analysis}}
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should preserve content-image blocks with mustache expressions', () => {
    const prompt = `
<content-image>{{imageUrl}}</content-image>

<step as="dynamic">
  Process this dynamic image:

  <content-image>{{images[0]}}</content-image>

  And compare with:

  <content-image>{{referenceImage}}</content-image>
</step>
`.trimStart()

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-image blocks', () => {
    const prompt = `<content-image></content-image>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe('<content-image />')
  })

  it('should handle self-closing content-image blocks', () => {
    const prompt = `<content-image />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image with whitespace variations', () => {
    const prompt = `
<content-image>

https://example.com/image.jpg

</content-image>
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  const testCases = [
    {
      name: 'simple content-image',
      input: `<content-image>https://example.com/test.jpg</content-image>`,
    },
    {
      name: 'multiple content-images',
      input: `
<content-image>image1.jpg</content-image>

<content-image>image2.jpg</content-image>
`.trim(),
    },
    {
      name: 'content-image in conversation',
      input: `
<system>
  System prompt
</system>

<user>
  User message
</user>

<content-image>user-image.jpg</content-image>

<assistant>
  Response
</assistant>
`.trimStart(),
    },
    {
      name: 'content-image in step',
      input: `
<step as="test">
  Text before

  <content-image>step-image.jpg</content-image>

  Text after
</step>
`.trimStart(),
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
      name: 'tool-call in conversation',
      input: `
<assistant>
  I'll search for that information
</assistant>

<tool-call id="search_1" name="web_search" query="AI trends 2024" />
`.trim(),
    },
  ]

  testCases.forEach(({ name, input: prompt }) => {
    it(`should maintain round-trip consistency for ${name}`, () => {
      const ast = parse(prompt)
      const rootNode = fromAstToBlocks({ ast, prompt })
      const output = fromBlocksToText(rootNode)
      expect(output).toBe(prompt)
    })
  })

  it('should parse content-file in conversation', () => {
    const prompt = `
<user>
  Please review this document
</user>

<content-file name="report.pdf">/uploads/report.pdf</content-file>

<assistant>
  I'll review the document
</assistant>
`.trimStart()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('mixed content types', () => {
    const prompt = `
<user>
  Analyze this image and document
</user>

<content-image>chart.png</content-image>

<content-file name="data.csv">data.csv</content-file>

<tool-call id="analyze_1" name="analyze_data" image="chart.png" data="data.csv" />
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image inside assistant block', () => {
    const prompt = `
<assistant>
  Here is the image about the cat you requested:
  <content-image>https://google.com/img/cat.jpg</content-image>
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle text before and after content-image in message block', () => {
    const prompt = `
<user>
  Please analyze this image:

  <content-image>https://example.com/analysis.jpg</content-image>

  What do you see?
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple content blocks in a single message', () => {
    const prompt = `
<system>
  You are an image analysis assistant.

  <content-image>https://example.com/reference.jpg</content-image>

  Use this as a reference for comparison.

  <content-image>https://example.com/guidelines.pdf</content-image>

  Follow these guidelines.
</system>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-image inside message block', () => {
    const prompt = `
<assistant>
  Here's an empty image placeholder:
  <content-image></content-image>
  Please provide an image.
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)

    expect(output).toBe(output)
  })

  it('should handle only content-image in message block (no text)', () => {
    const prompt = `
<user>
  <content-image>https://example.com/only-image.jpg</content-image>
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle assistant message with content-image block', () => {
    const prompt = `
<assistant>
  Here is the image about the cat you requested:
  <content-image>https://google.com/img/cat.jpg</content-image>
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle user message with content before and after content-image', () => {
    const prompt = `
<user>
  Please analyze this image:

  <content-image>https://example.com/analysis.jpg</content-image>

  What do you see in it?
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple content-image blocks in assistant message', () => {
    const prompt = `
<assistant>
  Here are the images you requested:

  <content-image>https://example.com/image1.jpg</content-image>

  And here's another one:

  <content-image>https://example.com/image2.jpg</content-image>

  Hope these help!
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-image in message blocks', () => {
    const prompt = `
<assistant>
  Here's an empty image tag:
  <content-image />
  Done.
</assistant>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle system message with content tags', () => {
    const prompt = `
<system>
  You are an AI assistant. Here's a reference image:
  <content-image>https://example.com/reference.jpg</content-image>
  Use this as context for your responses.
</system>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block with path and attributes', () => {
    const prompt = `
<user>
  Here you can find your guidelines for the city
  <prompt path="./guidelines/cities" location={{city}} />
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block with static attributes', () => {
    const prompt = `
<user>
  <prompt path="./guidelines/cities" location="Barcelona" />
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block at root level', () => {
    const prompt = `
<prompt path="./shared/intro" />

Some text here
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty lines at the begining', () => {
    const prompt = `


Some text here
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block inside step', () => {
    const prompt = `
<step as="planning">
  <prompt path="./planning/template" project={{projectName}} />
  Additional planning content
</step>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should maintain round-trip consistency for prompt blocks', () => {
    const prompt = `
<user>
  Guidelines: <prompt path="./guidelines/cities" location={{city}} />


  Or default: <prompt path="./guidelines/cities" location="Barcelona" />
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle top-level content-file blocks', () => {
    const prompt = `
<content-file name="document.pdf">/path/to/document.pdf</content-file>
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple content-file blocks', () => {
    const prompt = `
<content-file name="doc1.pdf">/path/to/doc1.pdf</content-file>

<content-file name="doc2.docx">/path/to/doc2.docx</content-file>
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-file blocks', () => {
    const prompt = `<content-file name="empty.txt"></content-file>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe('<content-file name="empty.txt" />')
  })

  it('should handle self-closing content-file blocks', () => {
    const prompt = `<content-file name="test.pdf" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should treat tool results as code blocks', () => {
    const prompt = `
<tool id="call_1" name="search" />

<tool id="call_2" name="calculate">
  Something
</tool>
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children[0]?.type).toBe('code')
    expect((rootNode.children[0]?.children[0] as TextBlock)?.text).toBe(
      '<tool id="call_1" name="search" />',
    )
    expect(rootNode.children[2]?.type).toBe('code')
    expect((rootNode.children[2]?.children[0] as TextBlock)?.text).toBe(
      `
<tool id="call_2" name="calculate">
  Something
</tool>
      `.trim(),
    )

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should treat tool calls as code blocks', () => {
    const prompt = `
<tool-call id="call_1" name="search" query="AI" />

<tool-call id="call_2" name="calculate" expression="2+2">
  Something
</tool-call>
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children[0]?.type).toBe('code')
    expect((rootNode.children[0]?.children[0] as TextBlock)?.text).toBe(
      '<tool-call id="call_1" name="search" query="AI" />',
    )
    expect(rootNode.children[2]?.type).toBe('code')
    expect((rootNode.children[2]?.children[0] as TextBlock)?.text).toBe(
      `
<tool-call id="call_2" name="calculate" expression="2+2">
  Something
</tool-call>
      `.trim(),
    )

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle top-level tool-call blocks', () => {
    const prompt = `<tool-call id="call_123" name="get_weather" location="New York" unit="celsius" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple tool-call blocks', () => {
    const prompt = `
<tool-call id="call_1" name="search" query="AI" />

<tool-call id="call_2" name="calculate" expression="2+2" />
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty tool-call blocks', () => {
    const prompt = `<tool-call id="empty" name="noop"></tool-call>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe('<tool-call id="empty" name="noop"></tool-call>')
  })

  it('should handle self-closing tool-call blocks', () => {
    const prompt = `<tool-call id="test" name="ping" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle tool-call with additional parameters', () => {
    const prompt = `<tool-call id="search_1" name="web_search" timeout="30" retry="true" query="AI trends 2024" limit="10" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should separate parameters from core attributes in tool-call', () => {
    const prompt = `<tool-call id="calc_1" name="calculator" precision="high" async="false" debug="true" />`
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-file blocks in steps', () => {
    const prompt = `
<step as="document_review">
  Please review this document:

  <content-file name="report.pdf">/uploads/report.pdf</content-file>

  Provide feedback.
</step>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle tool-call blocks in steps', () => {
    const prompt = `
<step as="api_call">
  Making API call:

  <tool-call id="weather_1" name="get_weather" city="London" />

  Processing response.
</step>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image, content-file, and tool-call together', () => {
    const prompt = `
<user>
  Here's an image:
  <content-image>https://example.com/image.jpg</content-image>

  And a document:
  <content-file name="data.csv">/path/to/data.csv</content-file>

  Please analyze both and call this tool:
  <tool-call id="analyze_1" name="analyze_data" image_url="https://example.com/image.jpg" data_file="/path/to/data.csv" />
</user>
`.trimStart()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt reference followed by text without extra spacing', () => {
    const prompt = `
<prompt path="./other-prompt" myVariable={{42}} />
Hi, I am a new line
`.trim()

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)

    expect(output).toBe(prompt)
  })

  it('should parse variables', () => {
    const prompt = `
Hi there, I am a {{variable}}. Hey, {{me_too}}!
How are you?
`.trim()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children[0]?.children).toHaveLength(5)

    // Variables are generated without inner spaces
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should parse steps with everything', () => {
    const prompt = `
<step as="analysis" isolated raw="rawAnalysis" schema={{{type: "object", properties: {correct: {type: "boolean"}}, required: ["correct"]}}}>
  Is this statement correct? {{statement}}
  Respond only with "correct: true" or "correct: false" in a JSON object.
</step>
`.trimStart()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('handles step without isolated attribute', () => {
    const prompt = '<step>Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.isolated).toBeFalsy()

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step>
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with literal empty isolated attribute', () => {
    const prompt = '<step isolated="">Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.isolated).toBeFalsy()

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step>
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with literal isolated attribute', () => {
    const prompt = '<step isolated>Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.isolated).toBeTruthy()

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step isolated>
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with non literal isolated attribute', () => {
    const prompt = `
{{ isolated = true}}
<step isolated={{isolated}}>Hello</step>
`.trim()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('code')

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('handles step without as attribute', () => {
    const prompt = '<step>Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.as).toBeUndefined()

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step>
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with literal empty as attribute', () => {
    const prompt = '<step as="">Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.as).toBeUndefined()

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step>
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with literal as attribute', () => {
    const prompt = '<step as="analysis">Hello</step>'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('step')
    expect((rootNode.children[0]! as StepBlock).attributes?.as).toBe('analysis')

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(
      `
<step as="analysis">
  Hello
</step>
`.trimStart(),
    )
  })

  it('handles step with non literal as attribute', () => {
    const prompt = `
{{ as = "analysis"}}
<step as={{as}}>Hello</step>
`.trim()
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    expect(rootNode.children[0]?.type).toBe('code')

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })
})
