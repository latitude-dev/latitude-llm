import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import { Message, MessageContent, TextContent } from '$promptl/types'
import { describe, expect, it } from 'vitest'

import { render } from '../..'
import { removeCommonIndent } from '../../utils'

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

describe('each loops', async () => {
  it('iterates over any iterable object', async () => {
    const prompt1 = `{{ for element in  [1, 2, 3] }} {{element}} {{ endfor }}`
    const prompt2 = `{{ for element in "foo" }} {{element}} {{ endfor }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('123')
    expect(result2).toBe('foo')
  })

  it('computes the else block when the element is not iterable', async () => {
    const prompt1 = `{{ for element in 5}} {{element}} {{ else }} FOO {{ endfor }}`
    const prompt2 = `{{ for element in { a: 1, b: 2, c: 3 } }} {{element}} {{ else }} FOO {{ endfor }}`

    const result1 = await getCompiledText(prompt1)
    const result2 = await getCompiledText(prompt2)

    expect(result1).toBe('FOO')
    expect(result2).toBe('FOO')
  })

  it('computes the else block when the iterable object is empty', async () => {
    const prompt = `{{ for element in [] }} {{element}} {{ else }} FOO {{ endfor }}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('FOO')
  })

  it('does not do anything when the iterable object is not iterable and there is no else block', async () => {
    const prompt = `{{ for element in 5 }} {{element}} {{ endfor }}`
    expect(render({ prompt, parameters: {} })).resolves
  })

  it('gives access to the index of the element', async () => {
    const prompt = `{{ for element, index in ['a', 'b', 'c'] }} {{index}} {{ endfor }}`
    const result = await getCompiledText(prompt)
    expect(result).toBe('012')
  })

  it('respects variable scope', async () => {
    const prompt1 = `{{ for elemenet in ['a', 'b', 'c'] }} {{foo = 5}} {{ endfor }} {{foo}}`
    const prompt2 = `{{foo = 5}} {{ for element in ['a', 'b', 'c'] }} {{foo = 7}} {{ endfor }} {{foo}}`
    const prompt3 = `{{foo = 5}} {{ for element in [1, 2, 3] }} {{foo += element}} {{ endfor }} {{foo}}`
    const action1 = () => render({ prompt: prompt1, parameters: {} })
    const error1 = await getExpectedError(action1, CompileError)
    const result2 = await getCompiledText(prompt2)
    const result3 = await getCompiledText(prompt3)

    expect(error1.code).toBe('variable-not-declared')
    expect(result2).toBe('7')
    expect(result3).toBe('11')
  })
})
