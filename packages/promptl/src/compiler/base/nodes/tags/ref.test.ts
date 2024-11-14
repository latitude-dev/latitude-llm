import path from 'path'

import { Chain, render } from '$promptl/compiler'
import { complete } from '$promptl/compiler/test/helpers'
import { removeCommonIndent } from '$promptl/compiler/utils'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import {
  MessageRole,
  SystemMessage,
  TextContent,
  UserMessage,
} from '$promptl/types'
import { describe, expect, it, vi } from 'vitest'

const buildReferenceFn =
  (prompts: Record<string, string>) =>
  async (refPath: string, sourcePath?: string) => {
    const fullPath = sourcePath
      ? path.resolve(path.dirname(sourcePath), refPath)
      : refPath

    if (!prompts[fullPath]) return undefined
    return {
      content: prompts[fullPath],
      path: fullPath,
    }
  }

describe('ref tags', async () => {
  it('allows referencing other prompts', async () => {
    const prompts = {
      parent: '<prompt path="child" />',
      child: 'child message',
    }

    const result = await render({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'child message',
      },
    ])
  })

  it('throws an error if the referenced function was not included', async () => {
    const prompts = {
      parent: '<prompt path="child" />',
      child: 'child message',
    }

    const action = () => render({ prompt: prompts['parent'] })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('missing-reference-function')
  })

  it('throws an error if the referenced prompt does not exist', async () => {
    const prompts = {
      parent: '<prompt path="child" />',
    }

    const action = () =>
      render({
        prompt: prompts['parent'],
        referenceFn: buildReferenceFn(prompts),
      })

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('reference-not-found')
  })

  it('referenced prompts do not inherit variables or parameters from parents', async () => {
    const prompts = {
      child: 'Child message: {{foo}}',
      parent: '<prompt path="child" />',
    }

    const action = () =>
      render({
        prompt: prompts['parent'],
        parameters: { foo: 'bar' },
        referenceFn: buildReferenceFn(prompts),
      })

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('referenced prompts can receive parameters as tag attributes', async () => {
    const prompts = {
      child: 'Child message: {{foo}}',
      parent: '<prompt path="child" foo="bar" />',
    }

    const result = await render({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Child message: bar',
      },
    ])
  })

  it('referenced prompts cannot modify parameters from parents', async () => {
    const prompts = {
      child: '{{ foo = foo + 1 }}',
      parent: '<prompt path="child" foo={{foo}} /> {{ foo }}',
    }

    const result = await render({
      prompt: prompts['parent'],
      parameters: { foo: 1 },
      referenceFn: buildReferenceFn(prompts),
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: '1',
      },
    ])
  })

  it('referenced prompts can include messages and contents', async () => {
    const prompts = {
      child: removeCommonIndent(`
        <user>User message</user>
        <content-text>This is a text content!</content-text>
      `),
      parent: '<prompt path="child" />',
    }

    const result = await render({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
    })

    expect(result.messages.length).toBe(2)
    const userMessage = result.messages[0]! as UserMessage
    expect(userMessage.content).toEqual([
      {
        type: 'text',
        text: 'User message',
      },
    ])
    const systemMessage = result.messages[1]! as SystemMessage
    expect(systemMessage.content).toEqual([
      {
        type: 'text',
        text: 'This is a text content!',
      },
    ])
  })

  it('prompts can be referenced inside messages', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        <user>
          <prompt path="child" />
        </user>
      `),
      child: 'Child message',
    }

    const result = await render({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]! as SystemMessage
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Child message',
      },
    ])
  })

  it('wrong tags combinations can raise errors even between references', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        <user>
          <prompt path="child" />
        </user>
      `),
      child: '<system>Foo</system>',
    }

    const action = () =>
      render({
        prompt: prompts['parent'],
        referenceFn: buildReferenceFn(prompts),
      })

    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('message-tag-inside-message')
  })

  it('can run steps from inside references', async () => {
    const prompts = {
      parent: removeCommonIndent(`
        <step>
          Step 1
        </step>

        <prompt path="child" />

        <step>
          Step 2
        </step>
      `),
      child: removeCommonIndent(`
        <step>
          <user>Substep 1</user>
        </step>
        <step>
          <user>Substep 2</user>
        </step>
      `),
    }

    const chain = new Chain({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
    })
    const { steps, conversation } = await complete({ chain })
    expect(steps).toBe(4)
    expect(conversation.messages.length).toBe(8) // 4 steps + 4 assistant responses
    const stepsContent = conversation.messages
      .filter((m) => m.role != MessageRole.assistant)
      .map((m) => (m.content[0] as TextContent).text)
    expect(stepsContent).toEqual(['Step 1', 'Substep 1', 'Substep 2', 'Step 2'])
  })

  it('node state from references correctly cached during steps', async () => {
    const func = vi.fn()

    const prompts = {
      parent: removeCommonIndent(`
        <prompt path="child" func={{func}} />
      `),
      child: removeCommonIndent(`
        <step>
          {{ func() }}
        </step>
        {{ for i in [1, 2] }}
          <step>
            {{ func() }}
          </step>
        {{ endfor }}
      `),
    }

    const chain = new Chain({
      prompt: prompts['parent'],
      referenceFn: buildReferenceFn(prompts),
      parameters: { func },
    })

    await complete({ chain })

    expect(func).toHaveBeenCalledTimes(3)
  })
})
