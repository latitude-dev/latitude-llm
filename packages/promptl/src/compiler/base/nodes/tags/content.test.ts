import { render } from '$promptl/compiler'
import { removeCommonIndent } from '$promptl/compiler/utils'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import {
  ImageContent,
  SystemMessage,
  TextContent,
  ToolCallContent,
  UserMessage,
} from '$promptl/types'
import { describe, expect, it } from 'vitest'

describe('content tags', async () => {
  it('adds stray text at root level as text contents inside a system message', async () => {
    const prompt = 'Test message'
    const result = await render({ prompt })
    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.role).toBe('system')
    expect(message.content.length).toBe(1)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0] as TextContent).text).toBe('Test message')
  })

  it('adds stray text inside a message as the message content', async () => {
    const prompt = '<user>Test user message</user>'
    const result = await render({ prompt })
    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as UserMessage
    expect(message.role).toBe('user')
    expect(message.content.length).toBe(1)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0] as TextContent).text).toBe('Test user message')
  })

  it('Can add multiple text and image contents inside a message', async () => {
    const prompt = removeCommonIndent(`
      <user>
        <content-text> Text 1 </content-text>
        <content-image> Image 1 </content-image>
        <content-text> Text 2 </content-text>
        <content-text> Text 3 </content-text>
      </user>
    `)
    const result = await render({ prompt })
    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as UserMessage
    expect(message.role).toBe('user')
    expect(message.content.length).toBe(4)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0] as TextContent).text).toBe('Text 1')
    expect(message.content[1]!.type).toBe('image')
    expect((message.content[1] as ImageContent).image).toBe('Image 1')
    expect(message.content[2]!.type).toBe('text')
    expect((message.content[2] as TextContent).text).toBe('Text 2')
    expect(message.content[3]!.type).toBe('text')
    expect((message.content[3] as TextContent).text).toBe('Text 3')
  })

  it('Can interpolate stray text and defined content tags', async () => {
    const prompt = removeCommonIndent(`
      Text 1
      <content-text> Text 2 </content-text>
      Text 3
    `)
    const result = await render({ prompt })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!
    expect(message.content.length).toBe(3)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0] as TextContent).text).toBe('Text 1')
    expect(message.content[1]!.type).toBe('text')
    expect((message.content[1] as TextContent).text).toBe('Text 2')
    expect(message.content[2]!.type).toBe('text')
    expect((message.content[2] as TextContent).text).toBe('Text 3')
  })

  it('Can use the general "content" tag with a type attribute', async () => {
    const prompt = removeCommonIndent(`
      <content type="text"> Text </content>
      <content type="image"> Image </content>
    `)
    const result = await render({ prompt })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!
    expect(message.content.length).toBe(2)
    expect(message.content[0]!.type).toBe('text')
    expect((message.content[0] as TextContent).text).toBe('Text')
    expect(message.content[1]!.type).toBe('image')
    expect((message.content[1] as ImageContent).image).toBe('Image')
  })

  it('Cannot include a content tag inside another content tag', async () => {
    const prompt = removeCommonIndent(`
      <content type="text">
        <content type="text"> Text </content>
      </content>
    `)
    const error = await getExpectedError(() => render({ prompt }), CompileError)
    expect(error.code).toBe('content-tag-inside-content')
  })
})

describe('tool-call tags', async () => {
  it('returns tool calls in the content of assistant messages', async () => {
    const prompt = removeCommonIndent(`
      <assistant>
        <tool-call name="get_weather" id="123" />
      </assistant>
    `)
    const result = await render({ prompt })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.role).toBe('assistant')
    expect(message.content.length).toBe(1)
    expect(message.content[0]!.type).toBe('tool-call')
    const toolCall = message.content[0]! as ToolCallContent
    expect(toolCall.toolName).toBe('get_weather')
    expect(toolCall.toolCallId).toBe('123')
  })

  it('fails when not in an assistant message tag', async () => {
    const prompt = removeCommonIndent(`
      <user>
        <tool-call name="get_weather" id="123" />
      </user>
    `)

    const error = await getExpectedError(() => render({ prompt }), CompileError)
    expect(error.code).toBe('invalid-tool-call-placement')
  })

  it('fails when a tool call is inside another tool call', async () => {
    const prompt = removeCommonIndent(`
      <assistant>
        <tool-call name="get_weather" id="123">
          <tool-call name="get_weather" id="456" />
        </tool-call>
      </assistant>
    `)

    const error = await getExpectedError(() => render({ prompt }), CompileError)
    expect(error.code).toBe('content-tag-inside-content')
  })
})
