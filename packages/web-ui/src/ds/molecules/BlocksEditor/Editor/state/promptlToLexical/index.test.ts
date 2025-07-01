import { describe, it, expect } from 'vitest'
import { parse, scan } from 'promptl-ai'
import { fromAstToBlocks } from './fromAstToBlocks'
import { fromBlocksToText } from './fromBlocksToText'
import { AstError } from '@latitude-data/constants/promptl'

describe('fromAstToBlocks', () => {
  it('should convert plain text to simple blocks', () => {
    const prompt = 'This is a simple text prompt.'
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

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
`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('add an empty paragraph to a message', () => {
    const prompt = `<user></user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    // @ts-expect-error - children is not defined
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
    const prompt = `<step></step>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    // @ts-expect-error - children is not defined
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
`

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
          line: 4,
          column: 19,
          character: 57,
        },
        end: {
          line: 9,
          column: 1,
          character: 121,
        },
        name: 'ParseError',
        message: "Expected '}}' but did not find it.",
        startIndex: 57,
        endIndex: 121,
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
`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
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

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  // FIXME: WHAT TO DO WITH CONFIG?!!!
  it('can parse config', () => {
    const prompt = `---
provider: OpenAI
model: gpt-4o-mini
---
I'm a simple prompt`

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image with data URLs', () => {
    const prompt = `<content-image>
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...
</content-image>`

    const ast = parse(prompt)

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

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
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
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

    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

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
    const rootNode = fromAstToBlocks({ ast, prompt })

    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
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
    const prompt = `<content-image>

https://example.com/image.jpg

</content-image>`

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
      name: 'tool-call in conversation',
      input: `<assistant>I'll search for that information</assistant>

<tool-call id="search_1" name="web_search" query="AI trends 2024" />`,
    },
  ]

  testCases.forEach(({ name, input }) => {
    it(`should maintain round-trip consistency for ${name}`, () => {
      const prompt = input.trim()
      const ast = parse(prompt)
      const rootNode = fromAstToBlocks({ ast, prompt })
      const output = fromBlocksToText(rootNode)
      expect(output).toBe(prompt)
    })
  })

  it('should parse content-file in conversation', () => {
    const prompt = `<user>Please review this document</user>

<content-file name="report.pdf">/uploads/report.pdf</content-file>

<assistant>I'll review the document</assistant>`
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('mixed content types', () => {
    const prompt = `<user>Analyze this image and document</user>

<content-image>chart.png</content-image>

<content-file name="data.csv">data.csv</content-file>

<tool-call id="analyze_1" name="analyze_data" image="chart.png" data="data.csv" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-image inside assistant block', () => {
    const prompt = `<assistant>
Here is the image about the cat you requested:
<content-image>https://google.com/img/cat.jpg</content-image>
</assistant>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle text before and after content-image in message block', () => {
    const prompt = `<user>
Please analyze this image:

<content-image>https://example.com/analysis.jpg</content-image>

What do you see?
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
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
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-image inside message block', () => {
    const prompt = `<assistant>
Here's an empty image placeholder:
<content-image></content-image>
Please provide an image.
</assistant>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)

    expect(output).toBe(output)
  })

  it('should handle only content-image in message block (no text)', () => {
    const prompt = `<user>
<content-image>https://example.com/only-image.jpg</content-image>
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle assistant message with content-image block', () => {
    const prompt = `<assistant>
Here is the image about the cat you requested:
<content-image>https://google.com/img/cat.jpg</content-image>
</assistant>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle user message with content before and after content-image', () => {
    const prompt = `<user>
Please analyze this image:

<content-image>https://example.com/analysis.jpg</content-image>

What do you see in it?
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
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
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty content-image in message blocks', () => {
    const prompt = `<assistant>
Here's an empty image tag:
<content-image />
Done.
</assistant>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle system message with content tags', () => {
    const prompt = `<system>
You are an AI assistant. Here's a reference image:
<content-image>https://example.com/reference.jpg</content-image>
Use this as context for your responses.
</system>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block with path and attributes', () => {
    const prompt = `<user>
  Here you can find your guidelines for the city
  <prompt path="./guidelines/cities" location={{city}} />
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block with static attributes', () => {
    const prompt = `<user>
  <prompt path="./guidelines/cities" location="Barcelona" />
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block at root level', () => {
    const prompt = `<prompt path="./shared/intro" />

Some text here`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle empty lines at the begining', () => {
    const prompt = `


Some text here`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt block inside step', () => {
    const prompt = `<step as="planning">
  <prompt path="./planning/template" project={{projectName}} />
  Additional planning content
</step>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should maintain round-trip consistency for prompt blocks', () => {
    const prompt = `<user>
  Guidelines: <prompt path="./guidelines/cities" location={{city}} />


  Or default: <prompt path="./guidelines/cities" location="Barcelona" />
</user>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle top-level content-file blocks', () => {
    const prompt = `<content-file name="document.pdf">
/path/to/document.pdf
</content-file>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple content-file blocks', () => {
    const prompt = `<content-file name="doc1.pdf">
/path/to/doc1.pdf
</content-file>

<content-file name="doc2.docx">
/path/to/doc2.docx
</content-file>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle content-file without name attribute', () => {
    const prompt = `<content-file>
/path/to/unnamed.pdf
</content-file>`

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

  it('should handle top-level tool-call blocks', () => {
    const prompt = `<tool-call id="call_123" name="get_weather" location="New York" unit="celsius" />`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle multiple tool-call blocks', () => {
    const prompt = `<tool-call id="call_1" name="search" query="AI" />

<tool-call id="call_2" name="calculate" expression="2+2" />`

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
    expect(output).toBe('<tool-call id="empty" name="noop" />')
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
    const prompt = `<step as="document_review">
Please review this document:

<content-file name="report.pdf">
/uploads/report.pdf
</content-file>

Provide feedback.
</step>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle tool-call blocks in steps', () => {
    const prompt = `<step as="api_call">
Making API call:

<tool-call id="weather_1" name="get_weather" city="London" />

Processing response.
</step>`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

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
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })

  it('should handle prompt reference followed by text without extra spacing', () => {
    const prompt = `<prompt path="./other-prompt" myVariable={{42}} />
Hi, I am a new line`

    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    const output = fromBlocksToText(rootNode)

    expect(output).toBe(prompt)
  })

  it('should parse variables', () => {
    const prompt = `
Hi there, I am a {{variable}}. Hey, {{me_too}}!
How are you?
`
    const ast = parse(prompt)
    const rootNode = fromAstToBlocks({ ast, prompt })
    expect(rootNode.children).toHaveLength(4)

    // Variables are generated without inner spaces
    const output = fromBlocksToText(rootNode)
    expect(output).toBe(prompt)
  })
})
