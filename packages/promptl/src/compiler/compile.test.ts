import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import {
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  TextContent,
} from '$promptl/types'
import { describe, expect, it } from 'vitest'

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

describe('automatic message grouping', async () => {
  it('returns system messages by default', async () => {
    const prompt = 'Hello world!'
    const result = await render({ prompt })
    const message = result.messages[0]!
    expect(message.role).toBe(MessageRole.system)
  })

  it('groups consecutive contents with the same role', async () => {
    const prompt = `
      Hello world
      <content-text>
        This is
      </content-text>
      your
      <content-image>
        Captain
      </content-image>
      speaking
    `
    const result = await render({ prompt })
    const messages = result.messages

    expect(messages.length).toBe(1)
    const message = messages[0]!
    expect(message.role).toBe(MessageRole.system)
    expect(message.content.length).toBe(5)
    expect(message.content[0]!.type).toBe(ContentType.text)
    expect(message.content[1]!.type).toBe(ContentType.text)
    expect(message.content[2]!.type).toBe(ContentType.text)
    expect(message.content[3]!.type).toBe(ContentType.image)
    expect(message.content[4]!.type).toBe(ContentType.text)
  })

  it('allows defining the default role', async () => {
    const prompt = 'Hello world!'
    const result = await render({ prompt, defaultRole: MessageRole.user })
    const message = result.messages[0]!
    expect(message.role).toBe(MessageRole.user)
  })
})

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
      {{ foo = 5 }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('5')
  })

  it('cannot reference undefined variables', async () => {
    const prompt = `
      {{ foo }}
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
      {{ foo }}
    `

    const result = await getCompiledText(prompt, { foo: 'bar' })
    expect(result).toBe('bar')
  })

  it('can update variables', async () => {
    const prompt = `
      {{ foo = 5 }}
      {{ foo += 2 }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('cannot update variables that are not defined', async () => {
    const prompt = `
      {{ foo += 2 }}
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
      {{ if true }}
        {{ foo = 5 }}
      {{ endif }}
      {{ foo }}
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
      {{ foo = 5 }}
      {{ if true }}
        {{ foo += 2 }}
      {{ endif }}
      {{ foo }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('7')
  })

  it('can update nested values', async () => {
    const prompt = `
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo.a += 2 }}
      {{ foo.b += 3 }}
      {{ foo.a }} {{ foo.b }}
    `
    const result = await getCompiledText(prompt)
    expect(result).toBe('3 5')
  })

  it('fails when nested value does not exist', async () => {
    const prompt = `
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo.c += 2 }}
      {{ foo.c }}
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
      {{ foo = { a: 1, b: 2 }  }}
      {{ foo?.a = 2 }}
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
      {{ foo = [1, 2, 3, 4, 5, 6]  }}
      {{ foo[3] = 'bar' }}

      {{ foo }}
    `

    const result = await getCompiledText(prompt)
    expect(result).toBe('[1,2,3,"bar",5,6]')
  })

  it('can modify variables with update operators', async () => {
    const prompt1 = `{{ foo = 0 }} {{ foo++ }} {{ foo }}`
    const prompt2 = `{{ foo = 0 }} {{ ++foo }} {{ foo }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('0 1')
    expect(result2).toBe('1 1')
  })

  it('fails when trying to use update expressions on non-number values', async () => {
    const prompt = `
      {{ foo = "bar" }}
      {{ ++foo }}
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
      const prompt = `${cleanExpression} = {{ ${expression} }}`
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
      const prompt = `${expression} = {{ ${expression} }}`
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
      const prompt = `${expression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected ?? ''}`.trim())
    }
  })

  it('correctly evaluates member expressions', async () => {
    const prompt = `{{ foo = { bar: 'var' }  }}{{ foo.bar }}`
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
      const prompt = `{{ foo = ${initial} }} {{ ${expression} }} ${cleanExpression} -> {{ foo }}`
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
      const prompt = `${expression} = {{ ${expression} }}`
      const result = await getCompiledText(prompt)
      expect(result).toBe(`${expression} = ${expected}`)
    }
  })
})
