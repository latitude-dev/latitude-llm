import { TAG_NAMES } from '$promptl/constants'
import CompileError from '$promptl/error/error'
import { getExpectedError } from '$promptl/test/helpers'
import { MessageRole, TextContent } from '$promptl/types'
import { describe, expect, it, vi } from 'vitest'

import { Chain } from './chain'
import { complete } from './test/helpers'
import { removeCommonIndent } from './utils'

describe('chain', async () => {
  it('does not return "completed" in the first iteration', async () => {
    const prompt = 'Hello world'
    const chain = new Chain({ prompt })
    const { completed } = await chain.step()
    expect(completed).toBe(false)
  })

  it('computes in a single iteration when there is no step tag', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 'foo' }}
      System message

      {{for element in [1, 2, 3]}}
        <user>
          User message: {{element}}
        </user>
      {{endfor}}

      <assistant>
        Assistant message: {{foo}}
      </assistant>
    `)

    const chain = new Chain({
      prompt: removeCommonIndent(prompt),
      parameters: {},
    })
    const { steps, conversation } = await complete({ chain })
    expect(steps).toBe(1)
    expect(conversation.messages.length).toBe(6) // This conversation includes the assistant response
    expect(conversation.messages[0]!.role).toBe(MessageRole.system)
    expect(conversation.messages[1]!.role).toBe(MessageRole.user)
    expect(conversation.messages[2]!.role).toBe(MessageRole.user)
    expect(conversation.messages[3]!.role).toBe(MessageRole.user)
    expect(conversation.messages[4]!.role).toBe(MessageRole.assistant) // manually set
    expect(conversation.messages[5]!.role).toBe(MessageRole.assistant)
  })

  it('fails when nesting steps', async () => {
    const prompt = removeCommonIndent(`
      <step>
        <step>
          Hello World!
        </step>
      </step>
    `)

    const chain = new Chain({ prompt })
    const action = () => chain.step()
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('step-tag-inside-step')
  })

  it('stops at a step tag', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Message 1
      </step>

      <step>
        Message 2
      </step>
    `)

    const chain = new Chain({ prompt })

    const { completed: completed1, conversation: step1 } = await chain.step()
    expect(completed1).toBe(false)
    expect(step1.messages.length).toBe(1) // The message in the first step

    const { completed: completed2, conversation: step2 } = await chain.step(
      'Response from step 1',
    )
    expect(completed2).toBe(false)
    expect(step2.messages.length).toBe(3) // Message in the first step, response, and message from second step

    const { completed: completed3, conversation: step3 } = await chain.step(
      'Response from step 2',
    )
    expect(completed3).toBe(true) // The chain has completed
    expect(step3.messages.length).toBe(4) // Same as before + response from step 2
  })

  it('fails when an assistant message is not provided in followup steps', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Before step
      </step>
      <step>
        After step
      </step>
    `)

    const chain = new Chain({ prompt })

    await chain.step()
    const action = () => chain.step()
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe('A response is required to continue the chain')
  })

  it('fails when an assistant message "response" is provided before compiling the first step', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Before step
      </step>
      <step>
        After step
      </step>
    `)

    const chain = new Chain({ prompt })

    const action = () => chain.step('Made up response')
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe(
      'A response is not allowed before the chain has started',
    )
  })

  it('fails when calling chain.step after the chain has completed', async () => {
    const prompt = removeCommonIndent(`
      <step />
      <step />
      <step />
      <step />
    `)

    const chain = new Chain({ prompt })

    await complete({ chain })
    const action = () => chain.step()
    const error = await getExpectedError(action, Error)
    expect(error.message).toBe('The chain has already completed')
  })

  it('allows adding steps conditionally', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Step 1
      </step>

      {{ if false }}
        <step>
          Step 2
        </step>
      {{ endif }}

      {{ if true }}
        <step>
          Step 3
        </step>
      {{ endif }}

      <step>
        Step 4
      </step>
    `)

    const chain = new Chain({ prompt })
    const { steps, conversation } = await complete({ chain })
    expect(steps).toBe(3)
    const stepMessages = conversation.messages.filter(
      (m) => m.role === MessageRole.system,
    )
    expect(stepMessages.length).toBe(3)
    expect((stepMessages[0]!.content[0] as TextContent).text).toBe('Step 1')
    expect((stepMessages[1]!.content[0] as TextContent).text).toBe('Step 3')
    expect((stepMessages[2]!.content[0] as TextContent).text).toBe('Step 4')
  })

  it('allows the last step to be conditional', async () => {
    const prompt = removeCommonIndent(`
      <step>
        Step 1
      </step>

      {{ if false }}
        <step>
          Step 2
        </step>
      {{ endif }}
    `)

    const chain = new Chain({ prompt })
    const { steps, conversation } = await complete({ chain })
    expect(steps).toBe(1)
    expect(conversation.messages.length).toBe(2)
    expect((conversation.messages[0]!.content[0] as TextContent).text).toBe(
      'Step 1',
    )
  })

  it('isolated steps do not include previous messages', async () => {
    const prompt = removeCommonIndent(`
      <step>
        First step
      </step>

      <step isolated>
        Isolated step
      </step>

      <step>
        Last step
      </step>
    `)

    const chain = new Chain({ prompt })

    const { conversation: step1 } = await chain.step()
    expect(step1.messages.length).toBe(1)
    expect((step1.messages[0]!.content[0] as TextContent).text).toBe(
      'First step',
    )

    const { conversation: step2 } = await chain.step('First step response')
    expect(step2.messages.length).toBe(1)
    expect((step2.messages[0]!.content[0] as TextContent).text).toBe(
      'Isolated step',
    )

    const { conversation: step3 } = await chain.step('Isolated step response')
    expect(step3.messages.length).toBe(3) // First step, first response, and last step
    expect((step3.messages[0]!.content[0] as TextContent).text).toBe(
      'First step',
    )
    expect((step3.messages[1]!.content[0] as TextContent).text).toBe(
      'First step response',
    )
    expect((step3.messages[2]!.content[0] as TextContent).text).toBe(
      'Last step',
    )

    const { completed } = await chain.step('Last step response')
    expect(completed).toBe(true)
  })

  it('does not reevaluate nodes', async () => {
    const prompt = removeCommonIndent(`
      <step>
        {{func1()}}
      </step>
      <step>
        {{func2()}}
      </step>
    `)

    const func1 = vi.fn().mockReturnValue('1')
    const func2 = vi.fn().mockReturnValue('2')

    const chain = new Chain({
      prompt,
      parameters: {
        func1,
        func2,
      },
    })

    const { conversation } = await complete({ chain })

    expect(conversation.messages[0]!).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '1',
        },
      ],
    })
    expect(conversation.messages[1]).toEqual({
      role: MessageRole.assistant,
      content: [
        {
          type: 'text',
          text: 'RESPONSE',
        },
      ],
    })
    expect(conversation.messages[2]).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '2',
        },
      ],
    })
    expect(func1).toHaveBeenCalledTimes(1)
    expect(func2).toHaveBeenCalledTimes(1)
  })

  it('maintains the scope on simple structures', async () => {
    const prompt = removeCommonIndent(`
      <step>
        {{foo = 5}}
      </step>

      <step>
        {{foo += 1}}
      </step>

      <step>
        {{foo}}
      </step>
    `)

    const chain = new Chain({ prompt })
    const { conversation } = await complete({ chain })

    expect(conversation.messages[conversation.messages.length - 2]).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '6',
        },
      ],
    })
  })

  it('maintains the scope in if statements', async () => {
    const correctPrompt = removeCommonIndent(`
      {{foo = 5}}

      {{if true}}
        {{foo += 1}}
        <step>
          {{ foo += 2 }}
        </step>
      {{endif}}

      {{foo}}
    `)

    const incorrectPrompt = removeCommonIndent(`
      {{foo = 5}}

      {{if true}}
        {{bar = 1}}
        <step>
          {{ bar++}}
        </step>
      {{endif}}

      {{bar}}
    `)

    const correctChain = new Chain({ prompt: correctPrompt })
    const { conversation } = await complete({ chain: correctChain })

    expect(conversation.messages[conversation.messages.length - 2]!).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '8',
        },
      ],
    })

    const incorrectChain = new Chain({
      prompt: incorrectPrompt,
      parameters: {},
    })

    const action = () => complete({ chain: incorrectChain })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('maintains the scope in for loops', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 0 }}

      {{for element in [1, 2, 3]}}
      
        <step>
          <user>
            {{foo}}
          </user>
        </step>

        {{foo = element}}
      {{endfor}}

      {{foo}}
    `)

    const chain = new Chain({ prompt })

    const { conversation } = await complete({ chain, maxSteps: 6 })
    expect(conversation.messages.length).toBe(8)
    expect((conversation.messages[0]!.content[0]! as TextContent).text).toBe(
      '0',
    )
    expect((conversation.messages[2]!.content[0]! as TextContent).text).toBe(
      '1',
    )
    expect((conversation.messages[4]!.content[0]! as TextContent).text).toBe(
      '2',
    )
    expect(conversation.messages[6]).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '3',
        },
      ],
    })
  })

  it('cannot access variables created in a loop outside its scope', async () => {
    const prompt = removeCommonIndent(`
      {{for i in [1, 2, 3]}}
        {{foo = i}}
        <step />
      {{endfor}}

      {{foo}}
    `)

    const chain = new Chain({ prompt })

    const action = () => complete({ chain })
    const error = await getExpectedError(action, CompileError)
    expect(error.code).toBe('variable-not-declared')
  })

  it('maintains the scope in nested loops', async () => {
    const prompt = removeCommonIndent(`
      {{ foo = 0 }}

      {{for i in [1, 2, 3]}}

        {{for j in [1, 2, 3]}}
          <user>
            {{i}}.{{j}}
          </user>

          <${TAG_NAMES.step} />

          {{foo = i * j}}
        {{endfor}}

        {{ foo }}
      {{endfor}}
    `)

    const chain = new Chain({ prompt })

    const { conversation } = await complete({ chain })
    const userMessages = conversation.messages.filter(
      (m) => m.role === MessageRole.user,
    )
    const userMessageText = userMessages
      .map((m) => m.content.map((c) => (c as TextContent).text).join(' '))
      .join('\n')
    expect(userMessageText).toBe(
      removeCommonIndent(`
      1.1
      1.2
      1.3
      2.1
      2.2
      2.3
      3.1
      3.2
      3.3
    `),
    )

    expect(conversation.messages[conversation.messages.length - 2]).toEqual({
      role: MessageRole.system,
      content: [
        {
          type: 'text',
          text: '9',
        },
      ],
    })
  })

  it('saves the response in a variable', async () => {
    const prompt = removeCommonIndent(`
      <${TAG_NAMES.step} as="response" />
      
      {{response}}
    `)

    const chain = new Chain({ prompt })

    await chain.step()
    const { conversation } = await chain.step('foo')

    expect(conversation.messages.length).toBe(2)

    const responseMessage = conversation.messages[0]!
    expect(responseMessage.role).toBe(MessageRole.assistant)
    expect(responseMessage.content.length).toBe(1)
    expect((responseMessage.content[0] as TextContent).text).toBe('foo')

    const additionalMessage = conversation.messages[1]!
    expect(additionalMessage.role).toBe(MessageRole.system)
    expect(additionalMessage.content.length).toBe(1)
    expect((additionalMessage.content[0] as TextContent).text).toBe(
      JSON.stringify(responseMessage.content),
    )
  })

  it('returns the correct configuration in all steps', async () => {
    const prompt = removeCommonIndent(`
      ---
      model: foo-1
      temperature: 0.5
      ---
      <step />                /* step1 */
      <step model="foo-2" />  /* step2 */
      <step temperature={{1}} />  /* step3 */
    `)

    const chain = new Chain({ prompt })

    const { conversation: step1 } = await chain.step()
    expect(step1.config.model).toBe('foo-1')
    expect(step1.config.temperature).toBe(0.5)

    const { conversation: step2 } = await chain.step('')
    expect(step2.config.model).toBe('foo-2')
    expect(step2.config.temperature).toBe(0.5)

    const { conversation: step3 } = await chain.step('')
    expect(step3.config.model).toBe('foo-1')
    expect(step3.config.temperature).toBe(1)

    const { conversation: finalConversation } = await chain.step('')
    expect(finalConversation.config.model).toBe('foo-1')
    expect(finalConversation.config.temperature).toBe(0.5)
  })
})
