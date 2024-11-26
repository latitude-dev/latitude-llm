import { getExpectedError } from '$compiler/compiler/test/helpers'
import { CUSTOM_TAG_END, CUSTOM_TAG_START } from '$compiler/constants'
import CompileError from '$compiler/error/error'
import {
  AssistantMessage,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  TextContent,
  UserMessage,
} from '$compiler/types'
import { describe, expect, it, vi } from 'vitest'

import { render } from '.'
import { removeCommonIndent } from './utils'

async function getCompiledText(
  prompt: string,
  parameters: Record<string, any> = {},
) {
  const result = await render({
    prompt: removeCommonIndent(prompt),
    parameters,
  })

  return result.messages.reduce((acc: string, message: Message) => {
    const content =
      typeof message.content === 'string'
        ? message.content
        : (message.content as MessageContent[])
            .map((c) => (c as TextContent).text)
            .join('')

    return acc + content
  }, '')
}

describe('config section', async () => {
  it('compiles the YAML written in the config section and returns it as the config attribute in the result', async () => {
    const prompt = `
      ---
      foo: bar
      baz:
       - qux
       - quux
      ---
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.config).toEqual({
      foo: 'bar',
      baz: ['qux', 'quux'],
    })
  })
})

describe('comments', async () => {
  it('does not add comments to the output', async () => {
    const prompt = `
      anna
      bob
      /* comment */
      charlie
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(1)
    const message = result.messages[0]!

    expect(message).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: 'anna\nbob\n\ncharlie',
        },
      ],
    })
  })

  it('also allows using tag comments', async () => {
    const prompt = `
      <system>
        <!-- comment -->
        Test message
      </system>
    `
    const result = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })

    expect(result.messages.length).toBe(1)

    const message = result.messages[0]!
    expect(message.content).toEqual([
      {
        type: 'text',
        text: 'Test message',
      },
    ])
  })
})

describe('reference tags', async () => {
  it('always fails', async () => {
    const prompts = {
      main: removeCommonIndent(`
        This is the main prompt.
        <prompt path="user_messages" />
        The end.
      `),
      user_messages: removeCommonIndent(`
        <user>
          User 1
        </user>
        <user>
          User 2
        </user>
      `),
    } as Record<string, string>

    const action = () =>
      render({
        prompt: prompts['main']!,
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('did-not-resolve-references')
  })
})

describe('variable assignment', async () => {
  it('can define variables', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('5')
  })

  it('cannot reference undefined variables', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('parameters are available as variables in the prompt', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `

    const result = await getCompiledText(prompt, { foo: 'bar' })
    expect(result).toBe('bar')
  })

  it('can update variables', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo += 2${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('cannot update variables that are not defined', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo += 2${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('variables defined in an inner scope are not available in the outer scope', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}#if true${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('variables can be modified from an inner scope', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}#if true${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}foo += 2${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('can update nested values', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = { a: 1, b: 2 } ${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo.a += 2${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo.b += 3${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo.a${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo.b${CUSTOM_TAG_END}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('3 5')
  })

  it('fails when nested value does not exist', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = { a: 1, b: 2 } ${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo.c += 2${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo.c${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('property-not-exists')
  })

  it('does not allow assignation on optional chaining operator', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = { a: 1, b: 2 } ${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo?.a = 2${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('parse-error') // Requirement is already implemented in the parser
  })

  it('allow reassigning elements in an array', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = [1, 2, 3, 4, 5, 6] ${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}foo[3] = 'bar'${CUSTOM_TAG_END}

      ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}
    `

    const result = await getCompiledText(prompt)
    expect(result).toBe('[1,2,3,"bar",5,6]')
  })

  it('can modify variables with update operators', async () => {
    const prompt1 = `${CUSTOM_TAG_START}foo = 0${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo++${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`
    const prompt2 = `${CUSTOM_TAG_START}foo = 0${CUSTOM_TAG_END} ${CUSTOM_TAG_START}++foo${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('0 1')
    expect(result2).toBe('1 1')
  })

  it('fails when trying to use update expressions on non-number values', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}foo = "bar"${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}++foo${CUSTOM_TAG_END}
    `
    const action = () =>
      render({
        prompt: removeCommonIndent(prompt),
        parameters: {},
      })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('invalid-update')
  })
})

describe('conditional expressions', async () => {
  it('only evaluates the content inside the correct branch', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}#if foo${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}whenTrue()${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END}
        ${CUSTOM_TAG_START}whenFalse()${CUSTOM_TAG_END}
      ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
    `
    const whenTrue = vi.fn()
    const whenFalse = vi.fn()

    await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: true,
        whenTrue,
        whenFalse,
      },
    })

    expect(whenTrue).toHaveBeenCalled()
    expect(whenFalse).not.toHaveBeenCalled()

    whenTrue.mockClear()
    whenFalse.mockClear()

    await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: false,
        whenTrue,
        whenFalse,
      },
    })

    expect(whenTrue).not.toHaveBeenCalled()
    expect(whenFalse).toHaveBeenCalled()
  })

  it('adds messages conditionally', async () => {
    const prompt = `
      ${CUSTOM_TAG_START}#if foo${CUSTOM_TAG_END}
        <user>Foo!</user>
      ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END}
        <assistant>Bar!</assistant>
      ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
    `
    const result1 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: true,
      },
    })
    const result2 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: {
        foo: false,
      },
    })

    expect(result1.messages.length).toBe(1)
    const message1 = result1.messages[0]! as UserMessage
    expect(message1.role).toBe('user')
    expect(message1.content.length).toBe(1)
    expect(message1.content[0]!.type).toBe('text')
    expect(message1.content).toEqual([{ type: 'text', text: 'Foo!' }])

    expect(result2.messages.length).toBe(1)
    const message2 = result2.messages[0]! as AssistantMessage
    expect(message2.role).toBe('assistant')
    expect(message2.content).toEqual([{ type: 'text', text: 'Bar!' }])
  })

  it('adds message contents conditionally', async () => {
    const prompt = `
      <user>
        ${CUSTOM_TAG_START}#if foo${CUSTOM_TAG_END}
          Foo!
        ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END}
          Bar!
        ${CUSTOM_TAG_START}/if${CUSTOM_TAG_END}
      </user>
    `

    const result1 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { foo: true },
    })
    const result2 = await render({
      prompt: removeCommonIndent(prompt),
      parameters: { foo: false },
    })

    expect(result1.messages).toEqual([
      {
        role: MessageRole.user,
        name: undefined,
        content: [
          {
            type: 'text',
            text: 'Foo!',
          },
        ],
      },
    ])
    expect(result2.messages).toEqual([
      {
        role: MessageRole.user,
        name: undefined,
        content: [
          {
            type: 'text',
            text: 'Bar!',
          },
        ],
      },
    ])
  })
})

describe('each loops', async () => {
  it('iterates over any iterable object', async () => {
    const prompt1 = `${CUSTOM_TAG_START}#each [1, 2, 3] as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`
    const prompt2 = `${CUSTOM_TAG_START}#each "foo" as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('123')
    expect(result2).toBe('foo')
  })

  it('computes the else block when the element is not iterable', async () => {
    const prompt1 = `${CUSTOM_TAG_START}#each 5 as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END} FOO ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`
    const prompt2 = `${CUSTOM_TAG_START}#each { a: 1, b: 2, c: 3 } as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END} FOO ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('FOO')
    expect(result2).toBe('FOO')
  })

  it('computes the else block when the iterable object is empty', async () => {
    const prompt = `${CUSTOM_TAG_START}#each [] as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}:else${CUSTOM_TAG_END} FOO ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('FOO')
  })

  it('does not do anything when the iterable object is not iterable and there is no else block', async () => {
    const prompt = `${CUSTOM_TAG_START}#each 5 as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`
    expect(render({ prompt, parameters: {} })).resolves
  })

  it('gives access to the index of the element', async () => {
    const prompt = `${CUSTOM_TAG_START}#each ['a', 'b', 'c'] as element, index${CUSTOM_TAG_END} ${CUSTOM_TAG_START}index${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('012')
  })

  it('respects variable scope', async () => {
    const prompt1 = `${CUSTOM_TAG_START}#each ['a', 'b', 'c'] as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`
    const prompt2 = `${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END} ${CUSTOM_TAG_START}#each ['a', 'b', 'c'] as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo = 7${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`
    const prompt3 = `${CUSTOM_TAG_START}foo = 5${CUSTOM_TAG_END} ${CUSTOM_TAG_START}#each [1, 2, 3] as element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo += element${CUSTOM_TAG_END} ${CUSTOM_TAG_START}/each${CUSTOM_TAG_END} ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`
    const action1 = () => render({ prompt: prompt1, parameters: {} })
    const error1 = await getExpectedError(action1, CompileError)
    const result2 = await getCompiledText(prompt2)
    const result3 = await getCompiledText(prompt3)

    expect(error1.code).toBe('variable-not-declared')
    expect(result2).toBe('7')
    expect(result3).toBe('11')
  })
})

describe('operators', async () => {
  it('correctly evaluates binary expressions', async () => {
    const expressions: [string, any][] = [
      ['2 == 2', true],
      ['2 == 3', false],
      ["2 == 'cat'", false],
      ["2 == '2'", true],
      ['2 != 2', false],
      ['2 != 3', true],
      ['2 === 2', true],
      ["2 === '2'", false],
      ['2 !== 2', false],
      ["2 !== '2'", true],
      ['2 < 2', false],
      ['2 < 3', true],
      ['2 < 1', false],
      ['2 <= 2', true],
      ['2 <= 3', true],
      ['2 <= 1', false],
      ['2 > 2', false],
      ['2 > 3', false],
      ['2 > 1', true],
      ['2 >= 2', true],
      ['2 >= 3', false],
      ['2 >= 1', true],
      ['2 << 2', 8],
      ['2 >> 2', 0],
      ['2 >>> 2', 0],
      ['2 + 3', 5],
      ['2 - 3', -1],
      ['2 * 3', 6],
      ['2 / 3', 2 / 3],
      ['2 % 3', 2],
      ['2 | 3', 3],
      ['2 ^ 3', 1],
      ['2 & 3', 2],
      ["'cat' in {cat: 1, dog: 2}", true],
      ["'cat' in {dog: 1, hamster: 2}", false],
    ]
    for (const [expression, expected] of expressions) {
      const cleanExpression = expression.replace(/</g, '\\<')
      const prompt = `${cleanExpression} = ${CUSTOM_TAG_START}${expression}${CUSTOM_TAG_END}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })

  it('correctly evaluates logical expressions', async () => {
    const expressions = [
      ['true && true', true],
      ['true && false', false],
      ['false && true', false],
      ['false && false', false],
      ['true || true', true],
      ['true || false', true],
      ['false || true', true],
      ['false || false', false],
      ['false ?? true', false],
      ['null ?? true', true],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = ${CUSTOM_TAG_START}${expression}${CUSTOM_TAG_END}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })

  it('correctly evaluates unary expressions', async () => {
    const expressions = [
      ['-2', -2],
      ['+2', 2],
      ['!true', false],
      ['~2', ~2],
      ['typeof 2', 'number'],
      ['void 2', undefined],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = ${CUSTOM_TAG_START}${expression}${CUSTOM_TAG_END}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected ?? ''}`.trim())
    }
  })

  it('correctly evaluates member expressions', async () => {
    const prompt = `${CUSTOM_TAG_START}foo = { bar: 'var' } ${CUSTOM_TAG_END}${CUSTOM_TAG_START}foo.bar${CUSTOM_TAG_END}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('var')
  })

  it('correctly evaluates assignment expressions', async () => {
    const expressions: [string, any, any][] = [
      ['foo += 2', 3, 5],
      ['foo -= 2', 3, 1],
      ['foo *= 2', 3, 6],
      ['foo /= 2', 3, 1.5],
      ['foo %= 2', 3, 1],
      ['foo <<= 2', 3, 12],
      ['foo >>= 2', 3, 0],
      ['foo >>>= 2', 3, 0],
      ['foo |= 2', 3, 3],
      ['foo ^= 2', 3, 1],
      ['foo &= 2', 3, 2],
    ]
    for (const [expression, initial, expected] of expressions) {
      const cleanExpression = expression.replace(/</g, '\\<')
      const prompt = `${CUSTOM_TAG_START}foo = ${initial}${CUSTOM_TAG_END} ${CUSTOM_TAG_START}${expression}${CUSTOM_TAG_END} ${cleanExpression} -> ${CUSTOM_TAG_START}foo${CUSTOM_TAG_END}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} -> ${expected}`)
    }
  })

  it('can evaluate complex expressions respecting operator precedence', async () => {
    const expressions: [string, any][] = [
      ['2 + 3 * 4', 14],
      ['2 * 3 + 4', 10],
      ['2 * (3 + 4)', 14],
      ['2 + 3 * 4 / 2', 8],
      ['2 + 3 * 4 % 2', 2],
      ['2 + 3 * 4 | 2', 14],
      ['2 + 3 * 4 ^ 2', 12],
      ['2 + 3 * 4 & 2', 2],
      ['2 + 3 * 4 === 14', true],
      ['2 + 3 * 4 !== 14', false],
      ['2 + 3 * 4 == 14', true],
      ['2 + 3 * 4 != 14', false],
      ["'a' + 'b' in {ab: 1, bc: 2}", true],
      ["'a' + 'b' in {bc: 1, cd: 2}", false],
      ["'a' + 'b' in {ab: 1, bc: 2} && 'a' + 'b' in {bc: 1, cd: 2}", false],
      ["'a' + 'b' in {ab: 1, bc: 2} || 'a' + 'b' in {bc: 1, cd: 2}", true],
    ]
    for (const [expression, expected] of expressions) {
      const prompt = `${expression} = ${CUSTOM_TAG_START}${expression}${CUSTOM_TAG_END}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })
})

describe('source map', async () => {
  it('does not include source map when not specified', async () => {
    const prompt = `
Given a context, answer questions succintly yet complete.
<system>{{ context }}</system>
<user>Please, help me with {{ question }}!</user>
    `
    const { messages } = await render({
      prompt,
      parameters: {
        context: 'context',
        question: 'question',
      },
    })
    expect(messages).toEqual([
      {
        role: MessageRole.system,
        content: [
          {
            type: ContentType.text,
            text: 'Given a context, answer questions succintly yet complete.',
          },
        ],
      },
      {
        role: MessageRole.system,
        content: [{ type: ContentType.text, text: 'context' }],
      },
      {
        role: MessageRole.user,
        content: [
          { type: ContentType.text, text: 'Please, help me with question!' },
        ],
      },
    ])
  })

  describe('includes source map when specified', async () => {
    it('returns empty source map when no identifiers', async () => {
      const prompt = `
  Given a context, answer questions succintly yet complete.
  <system>context</system>
  <user>Please, help me with question!</user>
      `
      const { messages } = await render({
        prompt,
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'context',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: 'Please, help me with question!',
              _promptlSourceMap: [],
            },
          ],
        },
      ])
    })

    it('returns source map when single identifiers per content', async () => {
      const prompt = `
  Given a context, answer questions succintly yet complete.
  <system>{{ context }}</system>
  <user>Please, help me with {{ question }}!</user>
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context: 'context',
          question: 'question',
        },
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'Given a context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'context',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 7,
                  identifier: 'context',
                },
              ],
            },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: 'Please, help me with question!',
              _promptlSourceMap: [
                {
                  start: 21,
                  end: 29,
                  identifier: 'question',
                },
              ],
            },
          ],
        },
      ])
    })

    it('returns source map when multiple identifiers per content', async () => {
      const prompt = `
  Given some context, answer questions succintly yet complete.
  <system>{{ context_1 }} and {{ context_2 }}</system>
  <user>Please, help me with {{ question_1 }} and {{ question_2 }}!</user>
      `
      const { messages } = await render({
        prompt,
        parameters: {
          context_1: 'context_1',
          context_2: 'context_2',
          question_1: 'question_1',
          question_2: 'question_2',
        },
        includeSourceMap: true,
      })
      expect(messages).toEqual([
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'Given some context, answer questions succintly yet complete.',
              _promptlSourceMap: [],
            },
          ],
        },
        {
          role: MessageRole.system,
          content: [
            {
              type: ContentType.text,
              text: 'context_1 and context_2',
              _promptlSourceMap: [
                {
                  start: 0,
                  end: 9,
                  identifier: 'context_1',
                },
                {
                  start: 14,
                  end: 23,
                  identifier: 'context_2',
                },
              ],
            },
          ],
        },
        {
          role: MessageRole.user,
          content: [
            {
              type: ContentType.text,
              text: 'Please, help me with question_1 and question_2!',
              _promptlSourceMap: [
                {
                  start: 21,
                  end: 31,
                  identifier: 'question_1',
                },
                {
                  start: 36,
                  end: 46,
                  identifier: 'question_2',
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
